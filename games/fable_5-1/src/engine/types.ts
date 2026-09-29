/** Colours are 0 for white and 1 for black so they can index arrays directly. */
export const WHITE = 0;
export const BLACK = 1;
export type Color = 0 | 1;

/** Piece types share numbering with the piece encoding: piece = type | (color << 3). */
export const EMPTY = 0;
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;
export type PieceType = 1 | 2 | 3 | 4 | 5 | 6;

export const pieceTypeOf = (piece: number): number => piece & 7;
export const pieceColorOf = (piece: number): Color => (piece >> 3) as Color;
export const makePiece = (type: number, color: Color): number => type | (color << 3);
export const opposite = (color: Color): Color => (color ^ 1) as Color;

/** Squares use the 0x88 layout: index = rank * 16 + file; (sq & 0x88) !== 0 means off-board. */
export type Square = number;
export const isOnBoard = (sq: number): boolean => (sq & 0x88) === 0;
export const fileOf = (sq: Square): number => sq & 7;
export const rankOf = (sq: Square): number => sq >> 4;
export const squareOf = (file: number, rank: number): Square => (rank << 4) | file;
export const NO_SQUARE = -1;

export const squareToAlgebraic = (sq: Square): string =>
  `${"abcdefgh"[fileOf(sq)]}${rankOf(sq) + 1}`;

export const algebraicToSquare = (text: string): Square => {
  const file = "abcdefgh".indexOf(text[0]);
  const rank = Number(text[1]) - 1;
  if (file < 0 || rank < 0 || rank > 7 || Number.isNaN(rank)) {
    throw new Error(`Bad square: ${text}`);
  }
  return squareOf(file, rank);
};

export const CASTLE_WK = 1;
export const CASTLE_WQ = 2;
export const CASTLE_BK = 4;
export const CASTLE_BQ = 8;

export const PIECE_LETTERS = " PNBRQK";
