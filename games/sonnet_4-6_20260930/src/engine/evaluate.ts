import {
  EMPTY, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
  pieceType, pieceColor,
  squareFile, squareRank,
  PIECE_VALUE,
} from "./constants.js";
import { BoardState, isKingInCheck } from "./board.js";

// Piece-square tables from white's perspective (rank 0 = rank 1 for white pieces)
// Black pieces use (7-rank) for rank index

const PST_PAWN = [
   0,  0,  0,  0,  0,  0,  0,  0,
   5, 10, 10,-20,-20, 10, 10,  5,
   5, -5,-10,  0,  0,-10, -5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5,  5, 10, 25, 25, 10,  5,  5,
  10, 10, 20, 30, 30, 20, 10, 10,
  50, 50, 50, 50, 50, 50, 50, 50,
   0,  0,  0,  0,  0,  0,  0,  0,
];

const PST_KNIGHT = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
];

const PST_BISHOP = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -20,-10,-10,-10,-10,-10,-10,-20,
];

const PST_ROOK = [
   0,  0,  0,  5,  5,  0,  0,  0,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   5, 10, 10, 10, 10, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0,
];

const PST_QUEEN = [
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  5,  0,  0,  0,  0,-10,
  -10,  5,  5,  5,  5,  5,  0,-10,
    0,  0,  5,  5,  5,  5,  0, -5,
   -5,  0,  5,  5,  5,  5,  0, -5,
  -10,  0,  5,  5,  5,  5,  0,-10,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20,
];

const PST_KING_MG = [
   20, 30, 10,  0,  0, 10, 30, 20,
   20, 20,  0,  0,  0,  0, 20, 20,
  -10,-20,-20,-20,-20,-20,-20,-10,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
];

const PST_BY_TYPE = [null, PST_PAWN, PST_KNIGHT, PST_BISHOP, PST_ROOK, PST_QUEEN, PST_KING_MG];

function getPstValue(pieceT: number, sq: number, color: number): number {
  const pst = PST_BY_TYPE[pieceT];
  if (!pst) return 0;
  const rank = squareRank(sq);
  const file = squareFile(sq);
  // For black: flip rank (black's rank 1 is at the top of the board)
  const pstRank = color === WHITE ? rank : 7 - rank;
  return pst[pstRank * 8 + file];
}

// Count total material (ignoring kings) for both sides
function countMaterial(board: BoardState): number {
  let total = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = board.squares[sq];
    if (p !== EMPTY) {
      const pt = pieceType(p);
      if (pt !== KING) total += PIECE_VALUE[pt];
    }
  }
  return total;
}

// Returns evaluation in centipawns from White's perspective
export function evaluateForWhite(board: BoardState): number {
  let score = 0;

  for (let sq = 0; sq < 64; sq++) {
    const p = board.squares[sq];
    if (p === EMPTY) continue;
    const pt = pieceType(p);
    const color = pieceColor(p);
    const sign = color === WHITE ? 1 : -1;
    score += sign * (PIECE_VALUE[pt] + getPstValue(pt, sq, color));
  }

  return score;
}

// Returns evaluation from the current side to move's perspective (for negamax)
export function evaluate(board: BoardState): number {
  const score = evaluateForWhite(board);
  return board.sideToMove === WHITE ? score : -score;
}
