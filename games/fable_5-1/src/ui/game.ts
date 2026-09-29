import { uciToMove, moveCaptured, moveFrom, moveTo, movePromotion, moveToUci, type Move } from "../engine/move";
import { Position, type GameStatus, type GameStatusKind } from "../engine/position";
import { moveToSan } from "../engine/san";
import { BLACK, WHITE, opposite, type Color, type Square } from "../engine/types";
import type { Difficulty } from "../engine/search";

export interface MoveProvider {
  requestMove(startFen: string, moves: string[], difficulty: Difficulty): Promise<string>;
}

export type PlayerMoveResult =
  | { kind: "ok" }
  | { kind: "promotion-needed" }
  | { kind: "illegal" }
  | { kind: "not-your-turn" };

export type GameOverReason = GameStatusKind | "resigned";

export interface GameOver {
  reason: GameOverReason;
  /** Absent for draws. */
  winner?: Color;
}

/** Piece types captured by each colour, indexed by the capturing side. */
export type CapturedPieces = readonly [readonly number[], readonly number[]];

/** Everything needed to replay a game from the start position; the shape used for save and restore. */
export interface GameSnapshot {
  version: 1;
  playerColor: Color;
  difficulty: Difficulty;
  /** Moves in UCI notation, from the standard start position. */
  moves: string[];
  resigned: boolean;
}

export type GameResult = "1-0" | "0-1" | "1/2-1/2" | "*";

const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard", "expert"];

export interface GameOptions {
  /** Pause before asking the engine, so the browser can paint the player's move first. */
  engineDelayMs?: number;
}

const sleep = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));

const parseSnapshot = (value: unknown): GameSnapshot => {
  if (typeof value !== "object" || value === null) throw new Error("Saved game must be an object");
  const { version, playerColor, difficulty, moves, resigned } = value as Record<string, unknown>; // Object checked above; each field is validated below.
  if (version !== 1) throw new Error("Unsupported saved game version");
  if (playerColor !== WHITE && playerColor !== BLACK) throw new Error("Saved game has an invalid player colour");
  if (typeof difficulty !== "string" || !DIFFICULTIES.includes(difficulty as Difficulty)) { // Membership checked by includes.
    throw new Error("Saved game has an invalid difficulty");
  }
  if (!Array.isArray(moves) || !moves.every((m) => typeof m === "string")) throw new Error("Saved game has invalid moves");
  if (typeof resigned !== "boolean") throw new Error("Saved game has an invalid resigned flag");
  return { version, playerColor, difficulty: difficulty as Difficulty, moves: moves as string[], resigned }; // Element types verified above.
};

/**
 * The game controller: owns the position and the move history, decides whose turn it is,
 * and drives the engine through an injected MoveProvider so it can be tested without a worker.
 */
export class Game {
  private pos = Position.fromFen(Position.START_FEN);
  private readonly uciMoves: string[] = [];
  private readonly sanMoves: string[] = [];
  private readonly capturedBy: [number[], number[]] = [[], []];
  private readonly listeners = new Set<() => void>();
  private thinking = false;
  private resigned = false;
  private started = false;
  private error: string | null = null;
  private pendingEngine: Promise<void> | null = null;
  /** Bumped by newGame and undo so a late engine reply for an old position is dropped. */
  private generation = 0;
  private color: Color = WHITE;
  private level: Difficulty = "medium";
  private readonly delayMs: number;
  private readonly engine: MoveProvider;

  constructor(engine: MoveProvider, options: GameOptions = {}) {
    this.engine = engine;
    this.delayMs = options.engineDelayMs ?? 0;
  }

  get position(): Position {
    return this.pos;
  }

  get startFen(): string {
    return Position.START_FEN;
  }

  get moves(): readonly string[] {
    return this.uciMoves;
  }

  get sans(): readonly string[] {
    return this.sanMoves;
  }

  get playerColor(): Color {
    return this.color;
  }

  get engineColor(): Color {
    return opposite(this.color);
  }

  get difficulty(): Difficulty {
    return this.level;
  }

  get isThinking(): boolean {
    return this.thinking;
  }

  get engineError(): string | null {
    return this.error;
  }

  get captured(): CapturedPieces {
    return this.capturedBy;
  }

  status(): GameStatus {
    return this.pos.status();
  }

  gameOver(): GameOver | null {
    if (this.resigned) return { reason: "resigned", winner: this.engineColor };
    const status = this.pos.status();
    if (status.kind === "ongoing") return null;
    if (status.kind === "checkmate") {
      return { reason: "checkmate", winner: status.winner === "w" ? WHITE : (1 as Color) };
    }
    return { reason: status.kind };
  }

  isPlayersTurn(): boolean {
    return this.pos.turn === this.color && !this.thinking && this.gameOver() === null;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  newGame(color: Color, difficulty: Difficulty): void {
    this.reset(color, difficulty);
    this.emit();
    if (this.pos.turn !== color) this.scheduleEngineMove();
  }

  /** Null until a game has been started or restored. */
  exportState(): GameSnapshot | null {
    if (!this.started) return null;
    return {
      version: 1,
      playerColor: this.color,
      difficulty: this.level,
      moves: [...this.uciMoves],
      resigned: this.resigned,
    };
  }

  /** PGN-style result of the current game; "*" while it is unfinished. */
  result(): GameResult {
    const over = this.gameOver();
    if (over === null) return "*";
    if (over.winner === undefined) return "1/2-1/2";
    return over.winner === WHITE ? "1-0" : "0-1";
  }

  /** Replaces the game with a snapshot. Throws, leaving the current game untouched, when it is invalid. */
  importState(value: unknown): void {
    const snapshot = parseSnapshot(value);
    // Validate the whole replay on a scratch position before touching live state.
    const scratch = Position.fromFen(Position.START_FEN);
    for (const uci of snapshot.moves) {
      const move = uciToMove(scratch, uci);
      if (move === null) throw new Error(`Illegal move in saved game: ${uci}`);
      scratch.makeMove(move);
    }
    this.reset(snapshot.playerColor, snapshot.difficulty);
    for (const uci of snapshot.moves) {
      const move = uciToMove(this.pos, uci);
      if (move !== null) this.apply(move);
    }
    this.resigned = snapshot.resigned;
    this.emit();
    if (this.pos.turn !== this.color && !this.resigned && this.gameOver() === null) this.scheduleEngineMove();
  }

  /** Legal moves from a square for the side to move; empty when the player cannot act. */
  legalMovesFrom(from: Square): Move[] {
    if (!this.isPlayersTurn()) return [];
    return this.pos.legalMoves().filter((m) => moveFrom(m) === from);
  }

  playerMove(from: Square, to: Square, promotion?: number): PlayerMoveResult {
    if (!this.isPlayersTurn()) return { kind: "not-your-turn" };
    const candidates = this.pos.legalMoves().filter((m) => moveFrom(m) === from && moveTo(m) === to);
    if (candidates.length === 0) return { kind: "illegal" };
    const promoting = movePromotion(candidates[0]) !== 0;
    let move: Move | undefined;
    if (promoting) {
      if (promotion === undefined) return { kind: "promotion-needed" };
      move = candidates.find((m) => movePromotion(m) === promotion);
    } else {
      move = candidates[0];
    }
    if (move === undefined) return { kind: "illegal" };
    this.apply(move);
    this.emit();
    if (this.gameOver() === null) this.scheduleEngineMove();
    return { kind: "ok" };
  }

  /** Asks the engine for its move now; resolves once it is on the board (or dropped/failed). */
  async engineMove(): Promise<void> {
    if (this.thinking || this.pos.turn === this.color || this.gameOver() !== null) return;
    const generation = this.generation;
    this.thinking = true;
    this.error = null;
    this.emit();
    try {
      await sleep(this.delayMs);
      const uci = await this.engine.requestMove(this.startFen, [...this.uciMoves], this.level);
      if (generation !== this.generation) return;
      const move = uciToMove(this.pos, uci);
      if (move === null) throw new Error(`Engine returned an illegal move: ${uci}`);
      this.apply(move);
    } catch (err) {
      if (generation !== this.generation) return;
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      if (generation === this.generation) {
        this.thinking = false;
        this.emit();
      }
    }
  }

  /** Resolves when any in-flight engine move has finished. */
  whenIdle(): Promise<void> {
    return this.pendingEngine ?? Promise.resolve();
  }

  /** Takes back the engine's reply and the player's last move; a no-op while the engine thinks. */
  undo(): void {
    if (this.thinking || this.resigned || this.pos.historyLength() === 0) return;
    this.generation++;
    for (let taken = 0; taken < 2 && this.pos.historyLength() > 0; taken++) {
      this.unapply();
      if (this.pos.turn === this.color) break;
    }
    this.error = null;
    this.emit();
    // Undoing only the engine's opening move as Black would leave the engine to move again.
    if (this.pos.turn !== this.color) this.scheduleEngineMove();
  }

  resign(): void {
    if (this.gameOver() !== null) return;
    this.generation++;
    this.thinking = false;
    this.resigned = true;
    this.emit();
  }

  private reset(color: Color, difficulty: Difficulty): void {
    this.generation++;
    this.pos = Position.fromFen(Position.START_FEN);
    this.uciMoves.length = 0;
    this.sanMoves.length = 0;
    this.capturedBy[0].length = 0;
    this.capturedBy[1].length = 0;
    this.color = color;
    this.level = difficulty;
    this.thinking = false;
    this.resigned = false;
    this.error = null;
    this.started = true;
  }

  private scheduleEngineMove(): void {
    this.pendingEngine = this.engineMove().finally(() => {
      this.pendingEngine = null;
    });
  }

  private apply(move: Move): void {
    const san = moveToSan(this.pos, move);
    const mover = this.pos.turn;
    this.pos.makeMove(move);
    this.uciMoves.push(moveToUci(move));
    this.sanMoves.push(san);
    const captured = moveCaptured(move);
    if (captured !== 0) this.capturedBy[mover].push(captured);
  }

  private unapply(): void {
    const last = this.pos.lastMove();
    if (last === null) return;
    this.pos.undoMove();
    this.uciMoves.pop();
    this.sanMoves.pop();
    if (moveCaptured(last) !== 0) this.capturedBy[this.pos.turn].pop();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
