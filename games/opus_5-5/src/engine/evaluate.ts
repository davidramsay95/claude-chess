import { BISHOP, BLACK, KING, PAWN, ROOK, WHITE } from "../chess/move";
import { BOARD_SQUARES, type Position } from "../chess/position";

/**
 * Piece values and piece-square tables are the public-domain PeSTO set (Ronald Friederich).
 * Tables are written rank 8 first, from White's point of view, so they read like a diagram.
 */
const MIDGAME_VALUES = [0, 82, 337, 365, 477, 1025, 0];
const ENDGAME_VALUES = [0, 94, 281, 297, 512, 936, 0];

/** Midgame weight of each piece type; the sum over a full board of pieces is `MAX_PHASE`. */
const PHASE_WEIGHTS = [0, 0, 1, 1, 2, 4, 0];
const MAX_PHASE = 24;

// prettier-ignore
const MIDGAME_TABLES: readonly (readonly number[])[] = [
  [],
  [
      0,   0,   0,   0,   0,   0,   0,   0,
     98, 134,  61,  95,  68, 126,  34, -11,
     -6,   7,  26,  31,  65,  56,  25, -20,
    -14,  13,   6,  21,  23,  12,  17, -23,
    -27,  -2,  -5,  12,  17,   6,  10, -25,
    -26,  -4,  -4, -10,   3,   3,  33, -12,
    -35,  -1, -20, -23, -15,  24,  38, -22,
      0,   0,   0,   0,   0,   0,   0,   0,
  ],
  [
   -167, -89, -34, -49,  61, -97, -15,-107,
    -73, -41,  72,  36,  23,  62,   7, -17,
    -47,  60,  37,  65,  84, 129,  73,  44,
     -9,  17,  19,  53,  37,  69,  18,  22,
    -13,   4,  16,  13,  28,  19,  21,  -8,
    -23,  -9,  12,  10,  19,  17,  25, -16,
    -29, -53, -12,  -3,  -1,  18, -14, -19,
   -105, -21, -58, -33, -17, -28, -19, -23,
  ],
  [
    -29,   4, -82, -37, -25, -42,   7,  -8,
    -26,  16, -18, -13,  30,  59,  18, -47,
    -16,  37,  43,  40,  35,  50,  37,  -2,
     -4,   5,  19,  50,  37,  37,   7,  -2,
     -6,  13,  13,  26,  34,  12,  10,   4,
      0,  15,  15,  15,  14,  27,  18,  10,
      4,  15,  16,   0,   7,  21,  33,   1,
    -33,  -3, -14, -21, -13, -12, -39, -21,
  ],
  [
     32,  42,  32,  51,  63,   9,  31,  43,
     27,  32,  58,  62,  80,  67,  26,  44,
     -5,  19,  26,  36,  17,  45,  61,  16,
    -24, -11,   7,  26,  24,  35,  -8, -20,
    -36, -26, -12,  -1,   9,  -7,   6, -23,
    -45, -25, -16, -17,   3,   0,  -5, -33,
    -44, -16, -20,  -9,  -1,  11,  -6, -71,
    -19, -13,   1,  17,  16,   7, -37, -26,
  ],
  [
    -28,   0,  29,  12,  59,  44,  43,  45,
    -24, -39,  -5,   1, -16,  57,  28,  54,
    -13, -17,   7,   8,  29,  56,  47,  57,
    -27, -27, -16, -16,  -1,  17,  -2,   1,
     -9, -26,  -9, -10,  -2,  -4,   3,  -3,
    -14,   2, -11,  -2,  -5,   2,  14,   5,
    -35,  -8,  11,   2,   8,  15,  -3,   1,
     -1, -18,  -9,  10, -15, -25, -31, -50,
  ],
  [
    -65,  23,  16, -15, -56, -34,   2,  13,
     29,  -1, -20,  -7,  -8,  -4, -38, -29,
     -9,  24,   2, -16, -20,   6,  22, -22,
    -17, -20, -12, -27, -30, -25, -14, -36,
    -49,  -1, -27, -39, -46, -44, -33, -51,
    -14, -14, -22, -46, -44, -30, -15, -27,
      1,   7,  -8, -64, -43, -16,   9,   8,
    -15,  36,  12, -54,   8, -28,  24,  14,
  ],
];

// prettier-ignore
const ENDGAME_TABLES: readonly (readonly number[])[] = [
  [],
  [
      0,   0,   0,   0,   0,   0,   0,   0,
    178, 173, 158, 134, 147, 132, 165, 187,
     94, 100,  85,  67,  56,  53,  82,  84,
     32,  24,  13,   5,  -2,   4,  17,  17,
     13,   9,  -3,  -7,  -7,  -8,   3,  -1,
      4,   7,  -6,   1,   0,  -5,  -1,  -8,
     13,   8,   8,  10,  13,   0,   2,  -7,
      0,   0,   0,   0,   0,   0,   0,   0,
  ],
  [
    -58, -38, -13, -28, -31, -27, -63, -99,
    -25,  -8, -25,  -2,  -9, -25, -24, -52,
    -24, -20,  10,   9,  -1,  -9, -19, -41,
    -17,   3,  22,  22,  22,  11,   8, -18,
    -18,  -6,  16,  25,  16,  17,   4, -18,
    -23,  -3,  -1,  15,  10,  -3, -20, -22,
    -42, -20, -10,  -5,  -2, -20, -23, -44,
    -29, -51, -23, -15, -22, -18, -50, -64,
  ],
  [
    -14, -21, -11,  -8,  -7,  -9, -17, -24,
     -8,  -4,   7, -12,  -3, -13,  -4, -14,
      2,  -8,   0,  -1,  -2,   6,   0,   4,
     -3,   9,  12,   9,  14,  10,   3,   2,
     -6,   3,  13,  19,   7,  10,  -3,  -9,
    -12,  -3,   8,  10,  13,   3,  -7, -15,
    -14, -18,  -7,  -1,   4,  -9, -15, -27,
    -23,  -9, -23,  -5,  -9, -16,  -5, -17,
  ],
  [
     13,  10,  18,  15,  12,  12,   8,   5,
     11,  13,  13,  11,  -3,   3,   8,   3,
      7,   7,   7,   5,   4,  -3,  -5,  -3,
      4,   3,  13,   1,   2,   1,  -1,   2,
      3,   5,   8,   4,  -5,  -6,  -8, -11,
     -4,   0,  -5,  -1,  -7, -12,  -8, -16,
     -6,  -6,   0,   2,  -9,  -9, -11,  -3,
     -9,   2,   3,  -1,  -5, -13,   4, -20,
  ],
  [
     -9,  22,  22,  27,  27,  19,  10,  20,
    -17,  20,  32,  41,  58,  25,  30,   0,
    -20,   6,   9,  49,  47,  35,  19,   9,
      3,  22,  24,  45,  57,  40,  57,  36,
    -18,  28,  19,  47,  31,  34,  39,  23,
    -16, -27,  15,   6,   9,  17,  10,   5,
    -22, -23, -30, -16, -16, -23, -36, -32,
    -33, -28, -22, -43,  -5, -32, -20, -41,
  ],
  [
    -74, -35, -18, -18, -11,  15,   4, -17,
    -12,  17,  14,  17,  17,  38,  23,  11,
     10,  17,  23,  15,  20,  45,  44,  13,
     -8,  22,  24,  27,  26,  33,  26,   3,
    -18,  -4,  21,  24,  27,  23,   9, -11,
    -19,  -3,  11,  21,  23,  16,   7,  -9,
    -27, -11,   4,  13,  14,   4,  -5, -17,
    -53, -34, -21, -11, -28, -14, -24, -43,
  ],
];

/**
 * Folds material and position into one lookup per (piece, square), signed so White is positive.
 * Indexed by `piece * 128 + square` to match the 0x88 board directly.
 */
const buildSignedTable = (values: readonly number[], tables: readonly (readonly number[])[]): Int16Array => {
  const signed = new Int16Array(16 * 128);
  for (let type = PAWN; type <= KING; type++) {
    for (const square of BOARD_SQUARES) {
      const rank = square >> 4;
      const file = square & 7;
      const whiteIndex = (7 - rank) * 8 + file;
      const blackIndex = rank * 8 + file;
      signed[type * 128 + square] = values[type] + tables[type][whiteIndex];
      signed[((BLACK << 3) | type) * 128 + square] = -(values[type] + tables[type][blackIndex]);
    }
  }
  return signed;
};

const MIDGAME_SIGNED = buildSignedTable(MIDGAME_VALUES, MIDGAME_TABLES);
const ENDGAME_SIGNED = buildSignedTable(ENDGAME_VALUES, ENDGAME_TABLES);

/**
 * Midgame and endgame halves of a term are packed into one integer so terms can be summed with a
 * single addition: the midgame value sits in the low 16 bits and the endgame value above it.
 */
const pack = (midgame: number, endgame: number): number => endgame * 65536 + midgame;
const midgameOf = (packed: number): number => (packed << 16) >> 16;
const endgameOf = (packed: number): number => (packed + 0x8000) >> 16;

const BISHOP_PAIR = pack(30, 50);
const DOUBLED_PAWN = pack(-10, -20);
const ISOLATED_PAWN = pack(-10, -15);
/** Indexed by rank counted from the pawn owner's side, 0 = own back rank. */
const PASSED_PAWN = [0, 5, 5, 10, 20, 35, 60, 0].map((midgame, rank) =>
  pack(midgame, [0, 10, 15, 25, 45, 75, 110, 0][rank]),
);
const ROOK_OPEN_FILE = pack(25, 10);
const ROOK_SEMI_OPEN_FILE = pack(12, 6);
const SHIELD_PAWN_NEAR = pack(15, 0);
const SHIELD_PAWN_FAR = pack(8, 0);

/**
 * Scratch state reused across calls so the evaluation, which runs at every quiescence node, never allocates.
 * File-indexed arrays are offset by one so the neighbours of the a- and h-files are always in range.
 */
const pawnsOnFile = new Int8Array(2 * 10);
const whiteLowestPawnRank = new Int8Array(10);
const blackHighestPawnRank = new Int8Array(10);
const pawnSquares = new Int16Array(16);
const rookSquares = new Int16Array(20);
const bishopCounts = new Int8Array(2);
let pawnCount = 0;
let rookCount = 0;

const resetScratch = (): void => {
  pawnsOnFile.fill(0);
  whiteLowestPawnRank.fill(8);
  blackHighestPawnRank.fill(-1);
  bishopCounts.fill(0);
  pawnCount = 0;
  rookCount = 0;
};

const recordPawn = (square: number, color: number): void => {
  const rank = square >> 4;
  const fileSlot = (square & 7) + 1;
  pawnsOnFile[color * 10 + fileSlot] += 1;
  if (color === WHITE) whiteLowestPawnRank[fileSlot] = Math.min(whiteLowestPawnRank[fileSlot], rank);
  else blackHighestPawnRank[fileSlot] = Math.max(blackHighestPawnRank[fileSlot], rank);
  pawnSquares[pawnCount++] = square;
};

const isPassed = (square: number, color: number): boolean => {
  const rank = square >> 4;
  const fileSlot = (square & 7) + 1;
  for (let slot = fileSlot - 1; slot <= fileSlot + 1; slot++) {
    if (color === WHITE ? blackHighestPawnRank[slot] > rank : whiteLowestPawnRank[slot] < rank) return false;
  }
  return true;
};

/** White-positive packed score for doubled, isolated and passed pawns. */
const pawnStructure = (board: Int8Array): number => {
  let score = 0;
  for (let index = 0; index < pawnCount; index++) {
    const square = pawnSquares[index];
    const color = board[square] >> 3;
    const sign = color === WHITE ? 1 : -1;
    const base = color * 10 + (square & 7) + 1;
    if (pawnsOnFile[base - 1] === 0 && pawnsOnFile[base + 1] === 0) score += sign * ISOLATED_PAWN;
    if (isPassed(square, color)) {
      const relativeRank = color === WHITE ? square >> 4 : 7 - (square >> 4);
      score += sign * PASSED_PAWN[relativeRank];
    }
  }
  for (let color = WHITE; color <= BLACK; color++) {
    const sign = color === WHITE ? 1 : -1;
    for (let slot = 1; slot <= 8; slot++) {
      const count = pawnsOnFile[color * 10 + slot];
      if (count > 1) score += sign * (count - 1) * DOUBLED_PAWN;
    }
  }
  return score;
};

/** White-positive packed score for rooks on files free of own (semi-open) or all (open) pawns. */
const rookFiles = (board: Int8Array): number => {
  let score = 0;
  for (let index = 0; index < rookCount; index++) {
    const square = rookSquares[index];
    const color = board[square] >> 3;
    const fileSlot = (square & 7) + 1;
    if (pawnsOnFile[color * 10 + fileSlot] !== 0) continue;
    const open = pawnsOnFile[(color ^ 1) * 10 + fileSlot] === 0;
    score += (color === WHITE ? 1 : -1) * (open ? ROOK_OPEN_FILE : ROOK_SEMI_OPEN_FILE);
  }
  return score;
};

/** Packed bonus for own pawns on the three files in front of the king, one or two ranks ahead. */
const kingShield = (board: Int8Array, kingSquare: number, color: number): number => {
  const forward = color === WHITE ? 16 : -16;
  const ownPawn = (color << 3) | PAWN;
  let score = 0;
  for (let fileOffset = -1; fileOffset <= 1; fileOffset++) {
    const near = kingSquare + forward + fileOffset;
    if (near & 0x88) continue;
    if (board[near] === ownPawn) score += SHIELD_PAWN_NEAR;
    else if (!((near + forward) & 0x88) && board[near + forward] === ownPawn) score += SHIELD_PAWN_FAR;
  }
  return score;
};

/**
 * Static evaluation in centipawns from the point of view of the side to move.
 * Blends midgame and endgame scores by how much non-pawn material remains.
 */
export const evaluate = (position: Position): number => {
  const board = position.board;
  resetScratch();
  let midgame = 0;
  let endgame = 0;
  let phase = 0;
  for (let index = 0; index < 64; index++) {
    const square = BOARD_SQUARES[index];
    const piece = board[square];
    if (piece === 0) continue;
    midgame += MIDGAME_SIGNED[piece * 128 + square];
    endgame += ENDGAME_SIGNED[piece * 128 + square];
    const type = piece & 7;
    phase += PHASE_WEIGHTS[type];
    if (type === PAWN) recordPawn(square, piece >> 3);
    else if (type === ROOK) rookSquares[rookCount++] = square;
    else if (type === BISHOP) bishopCounts[piece >> 3] += 1;
  }

  let terms = pawnStructure(board) + rookFiles(board);
  terms += kingShield(board, position.kingSquare(WHITE), WHITE) - kingShield(board, position.kingSquare(BLACK), BLACK);
  if (bishopCounts[WHITE] >= 2) terms += BISHOP_PAIR;
  if (bishopCounts[BLACK] >= 2) terms -= BISHOP_PAIR;
  midgame += midgameOf(terms);
  endgame += endgameOf(terms);

  const midgamePhase = Math.min(phase, MAX_PHASE);
  const blended = Math.trunc((midgame * midgamePhase + endgame * (MAX_PHASE - midgamePhase)) / MAX_PHASE);
  // `| 0` turns -0 into 0 so mirrored positions compare equal.
  return (position.turn === WHITE ? blended : -blended) | 0;
};
