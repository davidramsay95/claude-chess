import { PIECE_LETTERS, squareFromName, squareToName } from "./types";

/**
 * A move is packed into one integer so it can be compared, hashed and stored
 * in tables cheaply:
 *   bits  0-6  from square
 *   bits  7-13 to square
 *   bits 14-17 moving piece
 *   bits 18-21 captured piece (0 when none; the pawn for en passant)
 *   bits 22-24 promotion piece type (0 when none)
 *   bits 25-27 flags
 */
export type Move = number;

export const FLAG_EN_PASSANT = 1;
export const FLAG_CASTLE = 2;
export const FLAG_DOUBLE_PUSH = 4;

export const NO_MOVE: Move = 0;

export const encodeMove = (
  from: number,
  to: number,
  piece: number,
  captured: number,
  promotion: number,
  flags: number,
): Move => from | (to << 7) | (piece << 14) | (captured << 18) | (promotion << 22) | (flags << 25);

export const moveFrom = (move: Move): number => move & 0x7f;
export const moveTo = (move: Move): number => (move >> 7) & 0x7f;
export const movePiece = (move: Move): number => (move >> 14) & 0xf;
export const moveCaptured = (move: Move): number => (move >> 18) & 0xf;
export const movePromotion = (move: Move): number => (move >> 22) & 0x7;
export const moveFlags = (move: Move): number => (move >> 25) & 0x7;
export const isCapture = (move: Move): boolean => moveCaptured(move) !== 0;

/** UCI notation: e2e4, e7e8q. Castling is the king's two-square move. */
export const moveToUci = (move: Move): string => {
  const promotion = movePromotion(move);
  const suffix = promotion ? PIECE_LETTERS[promotion] : "";
  return `${squareToName(moveFrom(move))}${squareToName(moveTo(move))}${suffix}`;
};

export interface UciParts {
  from: number;
  to: number;
  promotion: number;
}

/** Parse the textual parts of a UCI move without checking legality. */
export const parseUci = (uci: string): UciParts | null => {
  if (!/^[a-h][1-8][a-h][1-8][nbrq]?$/.test(uci)) {
    return null;
  }
  const promotion = uci.length === 5 ? PIECE_LETTERS.indexOf(uci[4] ?? "") : 0;
  return { from: squareFromName(uci.slice(0, 2)), to: squareFromName(uci.slice(2, 4)), promotion };
};
