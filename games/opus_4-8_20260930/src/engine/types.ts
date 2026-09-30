// Core chess types shared across the engine, worker and UI.

/** Colour of a side. White is 0, Black is 1, matching the colour bit in a piece code. */
export const WHITE = 0;
export const BLACK = 1;
export type Color = typeof WHITE | typeof BLACK;

/** Piece type codes (low three bits of a piece code). */
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;
export type PieceType =
  | typeof PAWN
  | typeof KNIGHT
  | typeof BISHOP
  | typeof ROOK
  | typeof QUEEN
  | typeof KING;

/** Empty square sentinel. */
export const EMPTY = 0;

/**
 * A piece is encoded as `type | (color << 3)`.
 * White pawn = 1, black pawn = 9, white king = 6, black king = 14, and so on.
 */
export type Piece = number;

export function makePiece(type: PieceType, color: Color): Piece {
  return type | (color << 3);
}

export function pieceType(piece: Piece): PieceType {
  return (piece & 0x7) as PieceType;
}

export function pieceColor(piece: Piece): Color {
  return ((piece >> 3) & 1) as Color;
}

/** Move flags. A move carries exactly one of the mutually exclusive special kinds. */
export const FLAG_NORMAL = 0;
export const FLAG_DOUBLE_PUSH = 1;
export const FLAG_EN_PASSANT = 2;
export const FLAG_CASTLE_KING = 3;
export const FLAG_CASTLE_QUEEN = 4;

export interface Move {
  from: number; // 0x88 square index
  to: number; // 0x88 square index
  piece: Piece; // the moving piece
  captured: Piece; // captured piece code, or EMPTY
  promotion: PieceType | 0; // promotion target type, or 0
  flag: number; // one of the FLAG_* constants
}

/** Castling-rights bit flags. */
export const CASTLE_WK = 1;
export const CASTLE_WQ = 2;
export const CASTLE_BK = 4;
export const CASTLE_BQ = 8;

/** Terminal states of a position for the side to move / whole game. */
export type GameResult = "1-0" | "0-1" | "1/2-1/2" | "*";
