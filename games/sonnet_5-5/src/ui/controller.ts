import { LEVELS, type EngineResponse, type Level } from '../engine/engineTypes';
import { Game } from '../engine/game';
import { START_FEN } from '../engine/position';
import {
  type Color,
  type Move,
  WHITE,
  isCapture,
  moveFrom,
  moveTo,
  moveToUci,
  pieceColor,
} from '../engine/types';
import { type GameResult, describeResult, resultFromStatus } from './gameResult';
import { type MoveAnimation, moveAnimations } from './moveAnimation';

/** The slice of EngineClient the controller needs; lets tests substitute a fake. */
export interface EnginePort {
  requestMove: (startFen: string, moves: string[], level: Level) => Promise<EngineResponse>;
  cancel: () => void;
}

export interface GameConfig {
  playerColor: Color;
  level: Level;
  /** Defaults to the standard start position. */
  startFen?: string;
}

export interface ControllerOptions {
  /** Minimum time a computer reply takes, so instant answers do not feel jarring. */
  minDelayMs?: number;
}

export interface TargetSquare {
  square: number;
  capture: boolean;
}

export interface SquarePair {
  from: number;
  to: number;
}

export interface GameSnapshot {
  active: boolean;
  board: Int8Array;
  turn: Color;
  playerColor: Color;
  level: Level;
  selected: number | null;
  targets: TargetSquare[];
  lastMove: SquarePair | null;
  checkSquare: number | null;
  thinking: boolean;
  error: string | null;
  result: GameResult | null;
  pendingPromotion: SquarePair | null;
  sanHistory: string[];
  canUndo: boolean;
  canResign: boolean;
  /** Moves the view should animate for this snapshot; empty for undo, drags and restarts. */
  animations: MoveAnimation[];
  /** Changes whenever `announcement` is new, so the view can re-announce identical text. */
  announcementId: number;
  announcement: string;
}

/** Everything needed to rebuild a game by replaying it; JSON-serialisable. */
export interface SavedGame {
  startFen: string;
  playerColor: Color;
  level: Level;
  /** Half-moves in UCI coordinates, e.g. `e2e4`, `e7e8q`. */
  moves: string[];
  resigned: boolean;
}

export interface SavedGameSummary {
  result: '1-0' | '0-1' | '1/2-1/2' | '*';
  moveCount: number;
}

type Listener = (snapshot: GameSnapshot) => void;

const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Owns one game and all rules-facing UI state. It has no DOM dependency so the
 * flow (stale-response guarding, undo, promotion) is unit-testable.
 */
export class GameController {
  private game = new Game();
  private startFen = START_FEN;
  private playerColor: Color = WHITE;
  private level: Level = 'medium';
  private active = false;
  private selected: number | null = null;
  private thinking = false;
  private error: string | null = null;
  private result: GameResult | null = null;
  private pendingPromotion: SquarePair | null = null;
  private animations: MoveAnimation[] = [];
  private announcement = '';
  private announcementId = 0;
  /** Bumped whenever an in-flight engine request must be ignored. */
  private requestToken = 0;
  private readonly listeners = new Set<Listener>();
  private readonly minDelayMs: number;

  constructor(
    private readonly engine: EnginePort,
    options: ControllerOptions = {},
  ) {
    this.minDelayMs = options.minDelayMs ?? 250;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(config: GameConfig): void {
    this.cancelSearch();
    this.startFen = config.startFen ?? START_FEN;
    this.game = Game.fromFen(this.startFen);
    this.playerColor = config.playerColor;
    this.level = config.level;
    this.active = true;
    this.selected = null;
    this.error = null;
    this.result = resultFromStatus(this.game.status());
    this.pendingPromotion = null;
    this.animations = [];
    this.announce(`New game. You play ${config.playerColor === WHITE ? 'white' : 'black'}.`);
    this.emit();
    this.requestComputerMoveIfDue();
  }

  /** Returns null before the first game starts, so the setup screen has nothing to save. */
  exportSavedGame(): SavedGame | null {
    if (!this.active) return null;
    return {
      startFen: this.startFen,
      playerColor: this.playerColor,
      level: this.level,
      moves: this.game.moveHistory.map(moveToUci),
      resigned: this.result?.kind === 'resignation',
    };
  }

  summarizeSavedGame(): SavedGameSummary {
    const result = this.result;
    const winner = result === null || result.kind === 'draw' ? null : result.winner;
    const text = result?.kind === 'draw' ? '1/2-1/2' : winner === null ? '*' : winner === WHITE ? '1-0' : '0-1';
    return { result: text, moveCount: this.game.moveHistory.length };
  }

  /** Replays `saved` into a fresh game. Throws before touching any state if it is invalid. */
  importSavedGame(saved: unknown): void {
    const record = typeof saved === 'object' && saved !== null ? (saved as Record<string, unknown>) : null; // shape is validated field by field below
    if (record === null) throw new Error('Saved game must be an object.');
    const { startFen, playerColor, level, moves, resigned } = record;
    if (typeof startFen !== 'string') throw new Error('Saved game has no start position.');
    if (playerColor !== WHITE && playerColor !== 1) throw new Error('Saved game has an invalid player colour.');
    if (typeof level !== 'string' || !LEVELS.includes(level as Level)) throw new Error('Saved game has an invalid level.'); // includes() proves the value
    if (!Array.isArray(moves) || !moves.every((m) => typeof m === 'string')) throw new Error('Saved game has an invalid move list.');
    if (typeof resigned !== 'boolean') throw new Error('Saved game has an invalid resigned flag.');

    const game = Game.fromFen(startFen);
    (moves as string[]).forEach((uci, index) => { // every element checked to be a string above
      const move = game.parseUci(uci);
      if (move === undefined) throw new Error(`Illegal move ${uci} at ply ${index + 1}.`);
      game.play(move);
    });

    this.cancelSearch();
    this.game = game;
    this.startFen = startFen;
    this.playerColor = playerColor as Color; // narrowed to 0 or 1 above
    this.level = level as Level; // validated against LEVELS above
    this.active = true;
    this.selected = null;
    this.error = null;
    this.result = resigned ? { kind: 'resignation', winner: (playerColor ^ 1) as Color } : resultFromStatus(game.status());
    this.pendingPromotion = null;
    this.animations = [];
    this.announce('Game loaded.');
    this.emit();
    this.requestComputerMoveIfDue();
  }

  select(square: number): void {
    if (!this.canInteract() || !this.isOwnPiece(square)) return;
    this.selected = square;
    this.emit();
  }

  /** A click or tap on a square: move to it if legal, otherwise change or clear the selection. */
  tap(square: number): void {
    if (!this.canInteract()) return;
    if (this.selected !== null && this.targetsFor(this.selected).some((t) => t.square === square)) {
      this.tryPlayerMove(this.selected, square, true);
      return;
    }
    if (this.isOwnPiece(square)) this.selected = this.selected === square ? null : square;
    else this.selected = null;
    this.emit();
  }

  /** A drag released over `to`. Illegal or same-square drops leave the selection untouched. */
  drop(from: number, to: number): void {
    if (!this.canInteract()) return;
    if (from === to || !this.targetsFor(from).some((t) => t.square === to)) {
      this.emit();
      return;
    }
    this.tryPlayerMove(from, to, false);
  }

  /** Completes or cancels the promotion picker; pass null to cancel. */
  choosePromotion(kind: number | null): void {
    const pending = this.pendingPromotion;
    if (!pending) return;
    this.pendingPromotion = null;
    if (kind === null) {
      this.emit();
      return;
    }
    const move = this.game.findMove(pending.from, pending.to, kind);
    if (move === undefined) {
      this.emit();
      return;
    }
    this.commitMove(move, true, true);
  }

  undo(): void {
    if (!this.snapshotCanUndo()) return;
    const plies = this.game.turn === this.playerColor ? 2 : 1;
    for (let i = 0; i < plies; i++) this.game.undo();
    this.result = resultFromStatus(this.game.status());
    this.selected = null;
    this.error = null;
    this.pendingPromotion = null;
    this.animations = [];
    this.announce('Move taken back.');
    this.emit();
  }

  resign(): void {
    if (!this.active || this.result) return;
    this.cancelSearch();
    this.pendingPromotion = null;
    this.selected = null;
    this.result = { kind: 'resignation', winner: (this.playerColor ^ 1) as Color };
    this.animations = [];
    this.announce('You resigned.');
    this.emit();
  }

  retry(): void {
    if (!this.active || this.result || this.thinking) return;
    this.requestComputerMoveIfDue();
  }

  getSnapshot(): GameSnapshot {
    const status = this.game.status();
    const history = this.game.moveHistory;
    const last = history.length > 0 ? history[history.length - 1] : null;
    const turn = this.game.turn;
    return {
      active: this.active,
      board: this.game.position.board.slice(),
      turn,
      playerColor: this.playerColor,
      level: this.level,
      selected: this.selected,
      targets: this.selected === null ? [] : this.targetsFor(this.selected),
      lastMove: last === null ? null : { from: moveFrom(last), to: moveTo(last) },
      checkSquare: status.check && this.result?.kind !== 'resignation' ? this.game.position.kingSquare[turn] : null,
      thinking: this.thinking,
      error: this.error,
      result: this.result,
      pendingPromotion: this.pendingPromotion,
      sanHistory: [...this.game.sanHistory],
      canUndo: this.snapshotCanUndo(),
      canResign: this.active && !this.result,
      animations: this.animations,
      announcementId: this.announcementId,
      announcement: this.announcement,
    };
  }

  private snapshotCanUndo(): boolean {
    if (!this.active || this.thinking) return false;
    const plies = this.game.turn === this.playerColor ? 2 : 1;
    return this.game.moveHistory.length >= plies;
  }

  private canInteract(): boolean {
    return (
      this.active &&
      !this.thinking &&
      !this.result &&
      this.pendingPromotion === null &&
      this.game.turn === this.playerColor
    );
  }

  private isOwnPiece(square: number): boolean {
    const piece = this.game.position.board[square];
    return piece !== 0 && pieceColor(piece) === this.playerColor;
  }

  private targetsFor(from: number): TargetSquare[] {
    const seen = new Map<number, TargetSquare>();
    for (const move of this.game.legalMovesFrom(from)) {
      const to = moveTo(move);
      if (!seen.has(to)) seen.set(to, { square: to, capture: isCapture(move) });
    }
    return [...seen.values()];
  }

  private tryPlayerMove(from: number, to: number, animate: boolean): void {
    const candidates = this.game.legalMovesFrom(from).filter((m) => moveTo(m) === to);
    if (candidates.length === 0) return;
    if (candidates.length > 1) {
      this.pendingPromotion = { from, to };
      this.emit();
      return;
    }
    this.commitMove(candidates[0], true, animate);
  }

  private commitMove(move: Move, byPlayer: boolean, animate: boolean): void {
    const san = this.game.play(move);
    this.selected = null;
    this.animations = animate ? moveAnimations(move) : [];
    const status = this.game.status();
    this.result = resultFromStatus(status);
    const who = byPlayer ? 'You' : 'Computer';
    const tail = this.result
      ? ` ${describeResult(this.result, this.playerColor).title}. ${describeResult(this.result, this.playerColor).detail}.`
      : status.check
        ? ' Check.'
        : '';
    this.announce(`${who} played ${san}.${tail}`);
    this.emit();
    this.requestComputerMoveIfDue();
  }

  private requestComputerMoveIfDue(): void {
    if (!this.active || this.result || this.game.turn === this.playerColor) return;
    void this.requestComputerMove();
  }

  private async requestComputerMove(): Promise<void> {
    const token = ++this.requestToken;
    this.thinking = true;
    this.error = null;
    this.emit();
    const startedAt = Date.now();
    try {
      const uciMoves = this.game.moveHistory.map(moveToUci);
      const response = await this.engine.requestMove(this.startFen, uciMoves, this.level);
      const remaining = this.minDelayMs - (Date.now() - startedAt);
      if (remaining > 0) await sleep(remaining);
      if (token !== this.requestToken) return;
      this.thinking = false;
      const move = response.move === null ? undefined : this.game.parseUci(response.move);
      if (move === undefined) {
        this.error = `The engine returned an unusable move (${response.move ?? 'none'}).`;
        this.emit();
        return;
      }
      this.commitMove(move, false, true);
    } catch (caught) {
      if (token !== this.requestToken) return;
      this.thinking = false;
      this.error = caught instanceof Error && caught.message ? caught.message : 'The engine failed to respond.';
      this.emit();
    }
  }

  /** Invalidates any in-flight request and tells the worker to stop searching. */
  private cancelSearch(): void {
    this.requestToken++;
    if (this.thinking) this.engine.cancel();
    this.thinking = false;
  }

  private announce(text: string): void {
    this.announcement = text;
    this.announcementId++;
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
