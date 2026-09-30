/**
 * Core chess types shared across the engine's public API.
 *
 * These types are intentionally simple (strings/objects, no classes) so that
 * `GameState` stays structurally cloneable (e.g. via `structuredClone`, or
 * `postMessage` across the Web Worker boundary) without any custom
 * serialization logic.
 */

export type Color = "white" | "black";

export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

/** Algebraic square notation, e.g. `'e4'`. */
export type Square = string;

export interface Piece {
  readonly type: PieceType;
  readonly color: Color;
}

export interface Move {
  readonly from: Square;
  readonly to: Square;
  /** Present only for pawn promotions. */
  readonly promotion?: "q" | "r" | "b" | "n";
}

export type GameStatus =
  | "active"
  | "checkmate"
  | "stalemate"
  | "draw-repetition"
  | "draw-fifty-move"
  | "draw-insufficient-material";

export interface CastlingRights {
  readonly whiteKingside: boolean;
  readonly whiteQueenside: boolean;
  readonly blackKingside: boolean;
  readonly blackQueenside: boolean;
}

/**
 * Opaque (from the outside) internal game representation.
 *
 * Consumers should treat this as a value to pass back into the engine's
 * functions rather than reach into its fields directly. It is a plain,
 * JSON-serializable object (no functions, no `Map`/`Set`) so it can be
 * cloned, sent through `postMessage`, or round-tripped through `toFen`.
 */
export interface GameState {
  /** 64 squares, index = rank * 8 + file (0 = a1, 63 = h8). */
  readonly board: readonly (Piece | null)[];
  readonly turn: Color;
  readonly castlingRights: CastlingRights;
  /** Square a pawn could capture on-passant this move, or null. */
  readonly enPassantTarget: Square | null;
  /** Half-moves since the last pawn move or capture (fifty-move rule). */
  readonly halfmoveClock: number;
  readonly fullmoveNumber: number;
  /**
   * Position keys (board + turn + castling + en-passant) for every position
   * reached so far, including the current one. Used for threefold
   * repetition detection.
   */
  readonly positionHistory: readonly string[];
}

export const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
