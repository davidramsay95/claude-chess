import type { Color, GameState, Piece, PieceType } from "../engine/types";

/** Centipawn material values. */
export const PIECE_VALUES: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

// Standard piece-square tables (from White's perspective, a8=index 0 of the
// table's first row down to h1). Encourage central control and development,
// discourage edge/corner placement. Values are small relative to material so
// they nudge move choice without overriding tactics.
// prettier-ignore
const PAWN_TABLE = [
  0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5,  5, 10, 25, 25, 10,  5,  5,
  0,  0,  0, 20, 20,  0,  0,  0,
  5, -5,-10,  0,  0,-10, -5,  5,
  5, 10, 10,-20,-20, 10, 10,  5,
  0,  0,  0,  0,  0,  0,  0,  0,
];
// prettier-ignore
const KNIGHT_TABLE = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
];
// prettier-ignore
const BISHOP_TABLE = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20,
];
// prettier-ignore
const ROOK_TABLE = [
  0,  0,  0,  0,  0,  0,  0,  0,
  5, 10, 10, 10, 10, 10, 10,  5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  0,  0,  0,  5,  5,  0,  0,  0,
];
// prettier-ignore
const QUEEN_TABLE = [
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5,  5,  5,  5,  0,-10,
  -5,  0,  5,  5,  5,  5,  0, -5,
  0,  0,  5,  5,  5,  5,  0, -5,
  -10,  5,  5,  5,  5,  5,  0,-10,
  -10,  0,  5,  0,  0,  0,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20,
];
// prettier-ignore
const KING_MIDDLEGAME_TABLE = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
  20, 20,  0,  0,  0,  0, 20, 20,
  20, 30, 10,  0,  0, 10, 30, 20,
];

const TABLES: Record<PieceType, readonly number[]> = {
  p: PAWN_TABLE,
  n: KNIGHT_TABLE,
  b: BISHOP_TABLE,
  r: ROOK_TABLE,
  q: QUEEN_TABLE,
  k: KING_MIDDLEGAME_TABLE,
};

/**
 * Looks up a piece-square bonus. The tables above are written with index 0
 * as a8 (White's perspective looking at Black's back rank first), so for a
 * White piece on board index `i` (0 = a1) we need to flip vertically; for a
 * Black piece we flip horizontally as well since the tables are inherently
 * symmetric per-side (both sides "want" to advance towards the other end).
 */
function pieceSquareBonus(piece: Piece, boardIndex: number): number {
  const file = boardIndex & 7;
  const rank = boardIndex >> 3;
  const table = TABLES[piece.type];
  if (piece.color === "white") {
    const row = 7 - rank;
    return table[row * 8 + file];
  }
  const row = rank;
  return table[row * 8 + file];
}

/**
 * Static evaluation of `state`, in centipawns from White's perspective
 * (positive favors White, negative favors Black). Search code negates this
 * as needed depending on whose turn it is (negamax convention).
 */
export function evaluate(state: GameState): number {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const piece = state.board[i];
    if (!piece) continue;
    const value = PIECE_VALUES[piece.type] + pieceSquareBonus(piece, i);
    score += piece.color === "white" ? value : -value;
  }
  return score;
}

/** Evaluation from the perspective of `color` (positive = good for `color`). */
export function evaluateForColor(state: GameState, color: Color): number {
  const white = evaluate(state);
  return color === "white" ? white : -white;
}
