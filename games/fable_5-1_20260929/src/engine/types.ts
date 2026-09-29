/**
 * Board layout is 0x88: square = rank * 16 + file, a1 = 0, h8 = 119.
 * A square index is on the board when (square & 0x88) === 0.
 */

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const WHITE = 0;
export const BLACK = 1;
export type Color = typeof WHITE | typeof BLACK;

export const EMPTY = 0;
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;
export type PieceType = 1 | 2 | 3 | 4 | 5 | 6;

/** A piece is its type in the low three bits and its colour in bit 3. */
export const pieceOf = (type: number, color: number): number => type | (color << 3);
export const typeOf = (piece: number): number => piece & 7;
export const colorOf = (piece: number): Color => (piece >> 3) as Color;

export const CASTLE_WK = 1;
export const CASTLE_WQ = 2;
export const CASTLE_BK = 4;
export const CASTLE_BQ = 8;

export const NO_SQUARE = -1;

export const FILES = "abcdefgh";
export const RANKS = "12345678";

export const squareOf = (file: number, rank: number): number => rank * 16 + file;
export const fileOf = (square: number): number => square & 7;
export const rankOf = (square: number): number => square >> 4;
export const isOnBoard = (square: number): boolean => (square & 0x88) === 0;

export const squareToName = (square: number): string =>
  `${FILES[fileOf(square)]}${RANKS[rankOf(square)]}`;

export const squareFromName = (name: string): number => {
  const file = FILES.indexOf(name[0] ?? "");
  const rank = RANKS.indexOf(name[1] ?? "");
  if (file < 0 || rank < 0 || name.length !== 2) {
    throw new Error(`Bad square name: ${name}`);
  }
  return squareOf(file, rank);
};

export const PIECE_LETTERS = " pnbrqk";

/** Piece char as used in FEN: uppercase white, lowercase black. */
export const pieceToChar = (piece: number): string => {
  const letter = PIECE_LETTERS[typeOf(piece)] ?? " ";
  return colorOf(piece) === WHITE ? letter.toUpperCase() : letter;
};

export const pieceFromChar = (char: string): number => {
  const type = PIECE_LETTERS.indexOf(char.toLowerCase());
  if (type <= 0) {
    throw new Error(`Bad piece char: ${char}`);
  }
  return pieceOf(type, char === char.toUpperCase() ? WHITE : BLACK);
};

export const KNIGHT_DELTAS = [-33, -31, -18, -14, 14, 18, 31, 33] as const;
export const BISHOP_DELTAS = [-17, -15, 15, 17] as const;
export const ROOK_DELTAS = [-16, -1, 1, 16] as const;
export const KING_DELTAS = [-17, -16, -15, -1, 1, 15, 16, 17] as const;
