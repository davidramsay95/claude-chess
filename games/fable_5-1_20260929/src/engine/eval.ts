import type { Position } from "./position";
import { BISHOP, BLACK, EMPTY, KING, KNIGHT, PAWN, QUEEN, ROOK, WHITE, colorOf, isOnBoard, typeOf } from "./types";

/** Piece values in centipawns, indexed by piece type. The king's value only matters for move ordering. */
export const PIECE_VALUES: readonly number[] = [0, 100, 320, 330, 500, 900, 20000];

// Piece-square tables from white's point of view, rank 8 first so they read
// like a board. Values are small nudges on top of material.
const PAWN_TABLE = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];

const KNIGHT_TABLE = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];

const BISHOP_TABLE = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];

const ROOK_TABLE = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, 10, 10, 10, 10, 5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  0, 0, 0, 5, 5, 0, 0, 0,
];

const QUEEN_TABLE = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 5, 5, 5, 0, -5,
  0, 0, 5, 5, 5, 5, 0, -5,
  -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
];

const KING_MIDDLE_TABLE = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20,
];

const KING_END_TABLE = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10, 0, 0, -10, -20, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -30, 0, 0, 0, 0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50,
];

/**
 * Tables indexed [piece][square] for both colours, with the black tables
 * mirrored by rank, so evaluation is a plain lookup per piece.
 */
const PST = new Int16Array(16 * 128);
const KING_END_PST = new Int16Array(2 * 128);

const tableFor = (type: number): number[] | null => {
  switch (type) {
    case PAWN:
      return PAWN_TABLE;
    case KNIGHT:
      return KNIGHT_TABLE;
    case BISHOP:
      return BISHOP_TABLE;
    case ROOK:
      return ROOK_TABLE;
    case QUEEN:
      return QUEEN_TABLE;
    case KING:
      return KING_MIDDLE_TABLE;
    default:
      return null;
  }
};

for (let sq = 0; sq < 128; sq++) {
  if (!isOnBoard(sq)) continue;
  const file = sq & 7;
  const rank = sq >> 4;
  const whiteIndex = (7 - rank) * 8 + file;
  const blackIndex = rank * 8 + file;
  for (let type = PAWN; type <= KING; type++) {
    const table = tableFor(type);
    if (!table) continue;
    PST[((type | (WHITE << 3)) << 7) + sq] = table[whiteIndex] as number;
    PST[((type | (BLACK << 3)) << 7) + sq] = table[blackIndex] as number;
  }
  KING_END_PST[(WHITE << 7) + sq] = KING_END_TABLE[whiteIndex] as number;
  KING_END_PST[(BLACK << 7) + sq] = KING_END_TABLE[blackIndex] as number;
}

/** Material only, from the side to move's point of view. Used by the easy level. */
export const evaluateMaterial = (pos: Position): number => {
  let score = 0;
  const board = pos.board;
  for (let sq = 0; sq < 128; sq++) {
    if (!isOnBoard(sq)) continue;
    const piece = board[sq] as number;
    if (piece === EMPTY) continue;
    const value = PIECE_VALUES[typeOf(piece)] as number;
    score += colorOf(piece) === WHITE ? value : -value;
  }
  return pos.sideToMove === WHITE ? score : -score;
};

/**
 * Material plus piece-square tables, from the side to move's point of view.
 * The king table switches to the endgame one when the queens are gone or
 * there is little material left.
 */
export const evaluate = (pos: Position): number => {
  let score = 0;
  let nonPawnMaterial = 0;
  const board = pos.board;
  let whiteKing = -1;
  let blackKing = -1;
  for (let sq = 0; sq < 128; sq++) {
    if (!isOnBoard(sq)) continue;
    const piece = board[sq] as number;
    if (piece === EMPTY) continue;
    const type = typeOf(piece);
    if (type === KING) {
      if (colorOf(piece) === WHITE) whiteKing = sq;
      else blackKing = sq;
      continue;
    }
    const value = (PIECE_VALUES[type] as number) + (PST[(piece << 7) + sq] as number);
    if (type !== PAWN) nonPawnMaterial += PIECE_VALUES[type] as number;
    score += colorOf(piece) === WHITE ? value : -value;
  }
  const endgame = nonPawnMaterial <= 2600;
  if (whiteKing >= 0) {
    score += endgame ? (KING_END_PST[(WHITE << 7) + whiteKing] as number) : (PST[((KING | (WHITE << 3)) << 7) + whiteKing] as number);
  }
  if (blackKing >= 0) {
    score -= endgame ? (KING_END_PST[(BLACK << 7) + blackKing] as number) : (PST[((KING | (BLACK << 3)) << 7) + blackKing] as number);
  }
  return pos.sideToMove === WHITE ? score : -score;
};
