import { BISHOP, BLACK, KNIGHT, PAWN, QUEEN, ROOK, WHITE, pieceColor, pieceKind } from '../engine/types';

const START_COUNTS: Record<number, number> = {
  [PAWN]: 8,
  [KNIGHT]: 2,
  [BISHOP]: 2,
  [ROOK]: 2,
  [QUEEN]: 1,
};

export const PIECE_VALUES: Record<number, number> = {
  [PAWN]: 1,
  [KNIGHT]: 3,
  [BISHOP]: 3,
  [ROOK]: 5,
  [QUEEN]: 9,
};

/** Display order: most valuable first. */
const KIND_ORDER = [QUEEN, ROOK, BISHOP, KNIGHT, PAWN];

export interface Material {
  /** Piece kinds of Black's army that White has taken. */
  capturedByWhite: number[];
  /** Piece kinds of White's army that Black has taken. */
  capturedByBlack: number[];
  /** Points on the board, White minus Black. Counts promoted pieces at full value. */
  balance: number;
}

/**
 * Derives captures from what is missing versus the starting army. Promotions can hide
 * a capture (a captured promoted queen shows as a missing pawn), which is accepted.
 */
export const computeMaterial = (board: ArrayLike<number>): Material => {
  const counts: [Record<number, number>, Record<number, number>] = [{}, {}];
  let balance = 0;
  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (piece === 0) continue;
    const kind = pieceKind(piece);
    const color = pieceColor(piece);
    counts[color][kind] = (counts[color][kind] ?? 0) + 1;
    const value = PIECE_VALUES[kind] ?? 0;
    balance += color === WHITE ? value : -value;
  }
  const missing = (color: 0 | 1): number[] =>
    KIND_ORDER.flatMap((kind) => {
      const lost = Math.max(0, START_COUNTS[kind] - (counts[color][kind] ?? 0));
      return Array<number>(lost).fill(kind);
    });
  return { capturedByWhite: missing(BLACK), capturedByBlack: missing(WHITE), balance };
};

/** "+N" for the side that is ahead, otherwise null. `side` is the row's owner. */
export const formatAdvantage = (balance: number, side: 0 | 1): string | null => {
  const ahead = side === WHITE ? balance : -balance;
  return ahead > 0 ? `+${ahead}` : null;
};
