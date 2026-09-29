/**
 * Moves are packed into a single integer so move lists stay cheap for the search:
 * bits 0-6 from square, 7-13 to square, 14-16 promotion piece type, 17-20 flags.
 * Squares use 0x88 indexing (rank * 16 + file), so a1 = 0 and h8 = 119.
 */
export type Move = number;

/** Sentinel for "no move". a1 to a1 can never be a real move. */
export const NO_MOVE: Move = 0;

export const WHITE = 0;
export const BLACK = 1;
export type Color = typeof WHITE | typeof BLACK;

export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

export const FLAG_CAPTURE = 1;
export const FLAG_EN_PASSANT = 2;
export const FLAG_CASTLE = 4;
export const FLAG_DOUBLE_PUSH = 8;

const PROMOTION_LETTERS = ["", "", "n", "b", "r", "q"];

/** Packs move fields into a single integer. */
export const encodeMove = (from: number, to: number, promotion = 0, flags = 0): Move =>
  from | (to << 7) | (promotion << 14) | (flags << 17);

export const moveFrom = (move: Move): number => move & 0x7f;
export const moveTo = (move: Move): number => (move >> 7) & 0x7f;
export const movePromotion = (move: Move): number => (move >> 14) & 0x7;
export const moveFlags = (move: Move): number => (move >> 17) & 0xf;
export const isCapture = (move: Move): boolean => (moveFlags(move) & FLAG_CAPTURE) !== 0;

/** Converts a 0x88 square index to algebraic notation, e.g. 0 -> "a1". */
export const squareName = (square: number): string =>
  `${String.fromCharCode(97 + (square & 7))}${(square >> 4) + 1}`;

/** Converts algebraic notation to a 0x88 square index, or -1 when invalid. */
export const parseSquare = (name: string): number => {
  if (!/^[a-h][1-8]$/.test(name)) return -1;
  return (name.charCodeAt(1) - 49) * 16 + (name.charCodeAt(0) - 97);
};

/** Formats a move in UCI long algebraic notation, e.g. "e7e8q". */
export const moveToUci = (move: Move): string =>
  `${squareName(moveFrom(move))}${squareName(moveTo(move))}${PROMOTION_LETTERS[movePromotion(move)]}`;
