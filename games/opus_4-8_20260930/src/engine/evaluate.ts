import { Board, sq0x88 } from "./board.ts";
import {
  BISHOP,
  EMPTY,
  KING,
  KNIGHT,
  PAWN,
  pieceColor,
  pieceType,
  QUEEN,
  ROOK,
  WHITE,
} from "./types.ts";

export const PIECE_VALUE: Record<number, number> = {
  [PAWN]: 100,
  [KNIGHT]: 320,
  [BISHOP]: 330,
  [ROOK]: 500,
  [QUEEN]: 900,
  [KING]: 20000,
};

// Piece-square tables written from White's view, rank 8 first (index 0 = a8).
// They nudge pieces toward good squares: knights to the centre, pawns forward,
// the king into a castled shell in the middlegame.
// prettier-ignore
const PST_PAWN = [
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
const PST_KNIGHT = [
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
const PST_BISHOP = [
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
const PST_ROOK = [
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
const PST_QUEEN = [
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
const PST_KING_MID = [
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -20,-30,-30,-40,-40,-30,-30,-20,
 -10,-20,-20,-20,-20,-20,-20,-10,
  20, 20,  0,  0,  0,  0, 20, 20,
  20, 30, 10,  0,  0, 10, 30, 20,
];
// prettier-ignore
const PST_KING_END = [
 -50,-40,-30,-20,-20,-30,-40,-50,
 -30,-20,-10,  0,  0,-10,-20,-30,
 -30,-10, 20, 30, 30, 20,-10,-30,
 -30,-10, 30, 40, 40, 30,-10,-30,
 -30,-10, 30, 40, 40, 30,-10,-30,
 -30,-10, 20, 30, 30, 20,-10,-30,
 -30,-30,  0,  0,  0,  0,-30,-30,
 -50,-30,-30,-30,-30,-30,-30,-50,
];

const TABLES: Record<number, number[]> = {
  [PAWN]: PST_PAWN,
  [KNIGHT]: PST_KNIGHT,
  [BISHOP]: PST_BISHOP,
  [ROOK]: PST_ROOK,
  [QUEEN]: PST_QUEEN,
};

/** Table index for a piece: White reads top-down, Black is vertically mirrored. */
function tableIndex(file: number, rank: number, isWhite: boolean): number {
  return isWhite ? (7 - rank) * 8 + file : rank * 8 + file;
}

/**
 * Static evaluation in centipawns from the side-to-move's perspective
 * (positive = good for the player to move). Material plus piece-square tables,
 * with a king table that shifts toward the centre as material comes off.
 */
export function evaluate(board: Board): number {
  let white = 0;
  let black = 0;
  let nonPawnMaterial = 0;
  const kingSquares: Array<{ file: number; rank: number; isWhite: boolean }> = [];

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board.squares[sq0x88(file, rank)];
      if (piece === EMPTY) continue;
      const type = pieceType(piece);
      const isWhite = pieceColor(piece) === WHITE;
      const value = PIECE_VALUE[type];

      if (type === KING) {
        kingSquares.push({ file, rank, isWhite });
      } else {
        const table = TABLES[type];
        const positional = table[tableIndex(file, rank, isWhite)];
        if (isWhite) white += value + positional;
        else black += value + positional;
        if (type !== PAWN) nonPawnMaterial += value;
      }
    }
  }

  // Blend toward the endgame king table once queens/rooks are largely gone.
  const endgame = nonPawnMaterial <= 2 * PIECE_VALUE[ROOK];
  const kingTable = endgame ? PST_KING_END : PST_KING_MID;
  for (const k of kingSquares) {
    const positional = kingTable[tableIndex(k.file, k.rank, k.isWhite)];
    if (k.isWhite) white += positional;
    else black += positional;
  }

  const score = white - black;
  return board.turn === WHITE ? score : -score;
}
