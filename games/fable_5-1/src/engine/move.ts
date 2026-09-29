import { algebraicToSquare, squareToAlgebraic, type Square, PIECE_LETTERS } from "./types";
import type { Position } from "./position";

/**
 * Moves are packed into a single integer so that search allocates nothing per node:
 *   bits 0-6   from square (0x88)
 *   bits 7-13  to square (0x88)
 *   bits 14-16 promotion piece type (0 = none)
 *   bits 17-19 captured piece type (0 = none)
 *   bits 20-23 flags
 */
export type Move = number;

export const FLAG_CAPTURE = 1 << 20;
export const FLAG_DOUBLE_PUSH = 1 << 21;
export const FLAG_EN_PASSANT = 1 << 22;
export const FLAG_CASTLE = 1 << 23;

export const encodeMove = (
  from: Square,
  to: Square,
  captured: number,
  promotion: number,
  flags: number,
): Move => from | (to << 7) | (promotion << 14) | (captured << 17) | flags;

export const moveFrom = (m: Move): Square => m & 0x7f;
export const moveTo = (m: Move): Square => (m >> 7) & 0x7f;
export const movePromotion = (m: Move): number => (m >> 14) & 7;
export const moveCaptured = (m: Move): number => (m >> 17) & 7;
export const isCapture = (m: Move): boolean => (m & FLAG_CAPTURE) !== 0;
export const isEnPassant = (m: Move): boolean => (m & FLAG_EN_PASSANT) !== 0;
export const isCastle = (m: Move): boolean => (m & FLAG_CASTLE) !== 0;
export const isDoublePush = (m: Move): boolean => (m & FLAG_DOUBLE_PUSH) !== 0;
export const NO_MOVE: Move = 0;

export const moveToUci = (m: Move): string => {
  const promo = movePromotion(m);
  return `${squareToAlgebraic(moveFrom(m))}${squareToAlgebraic(moveTo(m))}${
    promo ? PIECE_LETTERS[promo].toLowerCase() : ""
  }`;
};

/** Resolves a UCI string against the legal moves of a position; null when it is not legal. */
export const uciToMove = (pos: Position, uci: string): Move | null => {
  if (uci.length < 4) return null;
  const from = algebraicToSquare(uci.slice(0, 2));
  const to = algebraicToSquare(uci.slice(2, 4));
  const promoLetter = uci.length > 4 ? uci[4].toUpperCase() : "";
  const promo = promoLetter ? PIECE_LETTERS.indexOf(promoLetter) : 0;
  for (const m of pos.legalMoves()) {
    if (moveFrom(m) === from && moveTo(m) === to && movePromotion(m) === promo) return m;
  }
  return null;
};
