/** Piece kinds. Values double as indices into piece-square tables (minus one). */
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

export const WHITE = 0;
export const BLACK = 1;
export type Color = 0 | 1;

export const EMPTY = 0;

/** A piece is `kind | (color << 3)`; empty squares are 0. */
export const makePiece = (kind: number, color: Color): number => kind | (color << 3);
export const pieceKind = (piece: number): number => piece & 7;
export const pieceColor = (piece: number): Color => ((piece >> 3) & 1) as Color;

export const CASTLE_WK = 1;
export const CASTLE_WQ = 2;
export const CASTLE_BK = 4;
export const CASTLE_BQ = 8;

/**
 * Squares are 0..63 with a1 = 0, b1 = 1, ... h8 = 63 (rank * 8 + file).
 */
export const squareFile = (sq: number): number => sq & 7;
export const squareRank = (sq: number): number => sq >> 3;
export const makeSquare = (file: number, rank: number): number => rank * 8 + file;

export const squareName = (sq: number): string =>
  `${'abcdefgh'[squareFile(sq)]}${squareRank(sq) + 1}`;

export const parseSquare = (name: string): number => {
  const file = name.charCodeAt(0) - 97;
  const rank = name.charCodeAt(1) - 49;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) throw new Error(`Bad square: ${name}`);
  return makeSquare(file, rank);
};

/**
 * A move is packed in an int:
 * bits 0-5 from, 6-11 to, 12-14 promotion kind, 15-19 flags.
 */
export type Move = number;

export const FLAG_CAPTURE = 1;
export const FLAG_EN_PASSANT = 2;
export const FLAG_CASTLE = 4;
export const FLAG_DOUBLE_PUSH = 8;

export const encodeMove = (from: number, to: number, promotion = 0, flags = 0): Move =>
  from | (to << 6) | (promotion << 12) | (flags << 15);

export const moveFrom = (m: Move): number => m & 63;
export const moveTo = (m: Move): number => (m >> 6) & 63;
export const movePromotion = (m: Move): number => (m >> 12) & 7;
export const moveFlags = (m: Move): number => (m >> 15) & 31;
export const isCapture = (m: Move): boolean => (moveFlags(m) & FLAG_CAPTURE) !== 0;
export const isEnPassant = (m: Move): boolean => (moveFlags(m) & FLAG_EN_PASSANT) !== 0;
export const isCastle = (m: Move): boolean => (moveFlags(m) & FLAG_CASTLE) !== 0;

export const NULL_MOVE: Move = 0;

/** Coordinate notation such as `e2e4` or `e7e8q`. */
export const moveToUci = (m: Move): string => {
  const promotion = movePromotion(m);
  const suffix = promotion ? 'nbrq'[promotion - KNIGHT] : '';
  return `${squareName(moveFrom(m))}${squareName(moveTo(m))}${suffix}`;
};
