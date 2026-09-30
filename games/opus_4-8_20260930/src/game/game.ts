import { Board } from "../engine/board.ts";
import { generateLegal } from "../engine/movegen.ts";
import { moveToSan, moveToUci, parseUci } from "../engine/notation.ts";
import {
  isFiftyMoveDraw,
  isInsufficientMaterial,
  isStalemate,
} from "../engine/rules.ts";
import { Color, Move, WHITE } from "../engine/types.ts";
import {
  Difficulty,
  EndReason,
  GameState,
  GameStatus,
  MoveRecord,
  PlayerColor,
  START_FEN,
} from "./types.ts";

/**
 * A full chess game: the current position, the move history with SAN, the
 * repetition ledger, and terminal-state detection. DOM-free so the UI, the
 * engine worker and the tests can all share it.
 */
export class Game {
  readonly startFen: string;
  playerColor: PlayerColor;
  difficulty: Difficulty;
  resigned = false;

  private board: Board;
  private records: MoveRecord[] = [];
  private repetition = new Map<string, number>();

  constructor(playerColor: PlayerColor, difficulty: Difficulty, startFen: string = START_FEN) {
    this.playerColor = playerColor;
    this.difficulty = difficulty;
    this.startFen = startFen;
    this.board = Board.fromFen(startFen);
    this.repetition.set(this.board.repetitionKey(), 1);
  }

  /** Build and validate a game from a saved state, replaying every move. */
  static fromState(state: GameState): Game {
    validateStateShape(state);
    const game = new Game(state.playerColor, state.difficulty, state.startFen);
    state.moves.forEach((uci, index) => {
      const move = parseUci(game.board, uci);
      if (!move) {
        throw new Error(`Move ${index + 1} (${uci}) is not legal`);
      }
      game.commit(move);
    });
    game.resigned = state.resigned === true;
    return game;
  }

  get turn(): Color {
    return this.board.turn;
  }

  get moveCount(): number {
    return this.records.length;
  }

  get history(): readonly MoveRecord[] {
    return this.records;
  }

  /** A snapshot of the current board (read-only clone via FEN). */
  currentFen(): string {
    return this.board.toFen();
  }

  /** FEN of the position after `ply` half-moves (0 = starting position). */
  fenAt(ply: number): string {
    if (ply <= 0) return this.startFen;
    const capped = Math.min(ply, this.records.length);
    return this.records[capped - 1].fenAfter;
  }

  /** A board reconstructed at `ply` half-moves, for review/back-stepping. */
  boardAt(ply: number): Board {
    return Board.fromFen(this.fenAt(ply));
  }

  legalMoves(): Move[] {
    return generateLegal(this.board);
  }

  legalMovesFrom(from: number): Move[] {
    return this.legalMoves().filter((m) => m.from === from);
  }

  findMove(from: number, to: number, promotion = 0): Move | null {
    for (const move of this.legalMoves()) {
      if (move.from === from && move.to === to && (move.promotion || 0) === promotion) {
        return move;
      }
    }
    return null;
  }

  /** Apply a legal move, updating history and the repetition ledger. */
  applyMove(move: Move): void {
    if (this.isOver()) throw new Error("Cannot move after the game has ended");
    this.commit(move);
  }

  applyUci(uci: string): boolean {
    const move = parseUci(this.board, uci);
    if (!move) return false;
    this.applyMove(move);
    return true;
  }

  resign(): void {
    if (!this.isOver()) this.resigned = true;
  }

  private commit(move: Move): void {
    const san = moveToSan(this.board, move);
    const uci = moveToUci(move);
    this.board.make(move);
    const key = this.board.repetitionKey();
    this.repetition.set(key, (this.repetition.get(key) ?? 0) + 1);
    this.records.push({ move, uci, san, fenAfter: this.board.toFen() });
  }

  isThreefold(): boolean {
    return (this.repetition.get(this.board.repetitionKey()) ?? 0) >= 3;
  }

  private naturalReason(): EndReason {
    if (this.board.inCheck() && this.legalMoves().length === 0) return "checkmate";
    if (isStalemate(this.board)) return "stalemate";
    if (isInsufficientMaterial(this.board)) return "insufficient";
    if (this.isThreefold()) return "threefold";
    if (isFiftyMoveDraw(this.board)) return "fifty-move";
    return null;
  }

  status(): GameStatus {
    const inCheck = this.board.inCheck();
    if (this.resigned) {
      const humanIsWhite = this.playerColor === "white";
      return {
        result: humanIsWhite ? "0-1" : "1-0",
        reason: "resignation",
        inCheck,
        isOver: true,
      };
    }
    const reason = this.naturalReason();
    let result: GameStatus["result"] = "*";
    if (reason === "checkmate") {
      result = this.board.turn === WHITE ? "0-1" : "1-0";
    } else if (reason) {
      result = "1/2-1/2";
    }
    return { result, reason, inCheck, isOver: reason !== null };
  }

  isOver(): boolean {
    return this.status().isOver;
  }

  toState(): GameState {
    return {
      version: 1,
      startFen: this.startFen,
      playerColor: this.playerColor,
      difficulty: this.difficulty,
      moves: this.records.map((r) => r.uci),
      resigned: this.resigned,
    };
  }
}

const VALID_COLORS: PlayerColor[] = ["white", "black"];
const VALID_DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "expert"];

/** Throw a descriptive error if `state` is not a well-formed GameState. */
export function validateStateShape(state: unknown): asserts state is GameState {
  if (typeof state !== "object" || state === null) {
    throw new Error("State must be an object");
  }
  const s = state as Record<string, unknown>;
  if (s.version !== 1) throw new Error("Unsupported state version");
  if (typeof s.startFen !== "string") throw new Error("Missing startFen");
  if (!VALID_COLORS.includes(s.playerColor as PlayerColor)) {
    throw new Error("Invalid playerColor");
  }
  if (!VALID_DIFFICULTIES.includes(s.difficulty as Difficulty)) {
    throw new Error("Invalid difficulty");
  }
  if (!Array.isArray(s.moves) || !s.moves.every((m) => typeof m === "string")) {
    throw new Error("Moves must be an array of strings");
  }
  if (typeof s.resigned !== "boolean") throw new Error("resigned must be a boolean");
  // Reject a startFen that does not parse before any replay begins.
  try {
    Board.fromFen(s.startFen);
  } catch {
    throw new Error("Invalid startFen");
  }
}
