import { BISHOP, BLACK, KING, KNIGHT, PAWN, Position, QUEEN, ROOK, WHITE } from "../core/position";

/**
 * Tapered evaluation: every term has a midgame and an endgame weight, blended by how much
 * non-pawn material is left. All tables are written from White's point of view with rank 8 on
 * the first row, so they read like a diagram.
 */

/** Material in centipawns, indexed by piece type. Shared with search for move ordering and pruning. */
export const PIECE_VALUE = [0, 100, 310, 330, 500, 950, 0];

const MATERIAL_MG = [0, 85, 320, 335, 470, 960, 0];
const MATERIAL_EG = [0, 105, 295, 315, 520, 950, 0];
/** How much each piece type counts towards the midgame phase; 24 is a full board. */
const PHASE_WEIGHT = [0, 0, 1, 1, 2, 4, 0];
const MAX_PHASE = 24;

// prettier-ignore
const PAWN_MG = [
    0,   0,   0,   0,   0,   0,   0,   0,
   45,  50,  55,  60,  60,  55,  50,  45,
   12,  18,  24,  32,  32,  24,  18,  12,
    4,   8,  12,  24,  24,  12,   8,   4,
    0,   2,   8,  20,  20,   6,   2,   0,
    4,   2,   4,   6,   6,  -2,   2,   4,
    6,   8,   8, -18, -18,  10,  10,   6,
    0,   0,   0,   0,   0,   0,   0,   0,
];
// prettier-ignore
const PAWN_EG = [
    0,   0,   0,   0,   0,   0,   0,   0,
   70,  70,  65,  60,  60,  65,  70,  70,
   40,  40,  35,  30,  30,  35,  40,  40,
   20,  18,  14,  10,  10,  14,  18,  20,
    8,   6,   4,   0,   0,   4,   6,   8,
    2,   2,   0,   0,   0,   0,   2,   2,
    0,   0,   0,   0,   0,   0,   0,   0,
    0,   0,   0,   0,   0,   0,   0,   0,
];
// prettier-ignore
const KNIGHT_MG = [
  -60, -35, -25, -20, -20, -25, -35, -60,
  -30, -15,   5,  10,  10,   5, -15, -30,
  -20,  10,  18,  24,  24,  18,  10, -20,
  -15,   6,  18,  26,  26,  18,   6, -15,
  -15,   4,  14,  20,  20,  14,   4, -15,
  -20,   2,  12,  12,  12,  12,   2, -20,
  -30, -15,  -2,   4,   4,  -2, -15, -30,
  -55, -25, -25, -20, -20, -25, -25, -55,
];
// prettier-ignore
const KNIGHT_EG = [
  -50, -30, -20, -15, -15, -20, -30, -50,
  -30, -10,   0,   5,   5,   0, -10, -30,
  -20,   0,  10,  15,  15,  10,   0, -20,
  -15,   5,  15,  20,  20,  15,   5, -15,
  -15,   5,  15,  20,  20,  15,   5, -15,
  -20,   0,  10,  15,  15,  10,   0, -20,
  -30, -10,   0,   5,   5,   0, -10, -30,
  -50, -30, -20, -15, -15, -20, -30, -50,
];
// prettier-ignore
const BISHOP_MG = [
  -20, -10, -10,  -8,  -8, -10, -10, -20,
  -10,   0,   2,   4,   4,   2,   0, -10,
   -6,   6,  10,  12,  12,  10,   6,  -6,
   -4,   8,  12,  16,  16,  12,   8,  -4,
   -4,  10,  12,  16,  16,  12,  10,  -4,
   -2,  10,  10,  10,  10,  10,  10,  -2,
   -6,  12,   6,   6,   6,   6,  12,  -6,
  -18,  -8, -12,  -8,  -8, -12,  -8, -18,
];
// prettier-ignore
const BISHOP_EG = [
  -15, -10,  -8,  -5,  -5,  -8, -10, -15,
  -10,  -2,   0,   2,   2,   0,  -2, -10,
   -8,   0,   6,   8,   8,   6,   0,  -8,
   -5,   2,   8,  12,  12,   8,   2,  -5,
   -5,   2,   8,  12,  12,   8,   2,  -5,
   -8,   0,   6,   8,   8,   6,   0,  -8,
  -10,  -2,   0,   2,   2,   0,  -2, -10,
  -15, -10,  -8,  -5,  -5,  -8, -10, -15,
];
// prettier-ignore
const ROOK_MG = [
    6,   8,  10,  12,  12,  10,   8,   6,
   18,  22,  24,  26,  26,  24,  22,  18,
   -4,   0,   2,   4,   4,   2,   0,  -4,
   -8,  -4,   0,   2,   2,   0,  -4,  -8,
  -10,  -6,  -2,   0,   0,  -2,  -6, -10,
  -10,  -6,  -2,   0,   0,  -2,  -6, -10,
  -14,  -6,  -2,   0,   0,  -2,  -6, -14,
   -6,  -4,   2,   8,   8,   4,  -4,  -6,
];
// prettier-ignore
const ROOK_EG = [
    8,   8,   8,   8,   8,   8,   8,   8,
   12,  12,  12,  12,  12,  12,  12,  12,
    4,   4,   4,   4,   4,   4,   4,   4,
    2,   2,   2,   2,   2,   2,   2,   2,
    0,   0,   0,   0,   0,   0,   0,   0,
   -2,  -2,  -2,  -2,  -2,  -2,  -2,  -2,
   -4,  -4,  -4,  -4,  -4,  -4,  -4,  -4,
   -4,  -2,   0,   0,   0,   0,  -2,  -4,
];
// prettier-ignore
const QUEEN_MG = [
  -20, -12, -10,  -6,  -6, -10, -12, -20,
  -12,  -8,   0,   0,   0,   0,  -8, -12,
  -10,   0,   4,   4,   4,   4,   0, -10,
   -6,   0,   4,   6,   6,   4,   0,  -6,
   -4,   0,   4,   6,   6,   4,   0,  -4,
  -10,   2,   4,   4,   4,   4,   2, -10,
  -12,  -2,   2,   2,   2,   2,  -2, -12,
  -20, -12,  -8,   0,  -4,  -8, -12, -20,
];
// prettier-ignore
const QUEEN_EG = [
  -20, -10,  -6,  -4,  -4,  -6, -10, -20,
  -10,   0,   4,   6,   6,   4,   0, -10,
   -6,   4,  10,  12,  12,  10,   4,  -6,
   -4,   6,  12,  16,  16,  12,   6,  -4,
   -4,   6,  12,  16,  16,  12,   6,  -4,
   -6,   4,  10,  12,  12,  10,   4,  -6,
  -10,   0,   4,   6,   6,   4,   0, -10,
  -20, -10,  -6,  -4,  -4,  -6, -10, -20,
];
// prettier-ignore
const KING_MG = [
  -60, -60, -60, -70, -70, -60, -60, -60,
  -50, -50, -55, -65, -65, -55, -50, -50,
  -45, -45, -50, -60, -60, -50, -45, -45,
  -40, -40, -45, -55, -55, -45, -40, -40,
  -30, -35, -40, -50, -50, -40, -35, -30,
  -15, -20, -25, -35, -35, -25, -20, -15,
   10,  10,  -8, -20, -20,  -8,  10,  10,
   18,  30,  12, -10,   0,  -2,  32,  20,
];
// prettier-ignore
const KING_EG = [
  -55, -35, -25, -20, -20, -25, -35, -55,
  -30, -10,   0,   5,   5,   0, -10, -30,
  -20,   5,  18,  25,  25,  18,   5, -20,
  -18,   8,  25,  32,  32,  25,   8, -18,
  -20,   5,  22,  30,  30,  22,   5, -20,
  -25,  -5,  10,  18,  18,  10,  -5, -25,
  -35, -15,  -5,   0,   0,  -5, -15, -35,
  -55, -40, -30, -25, -25, -30, -40, -55,
];

const TABLES_MG = [[], PAWN_MG, KNIGHT_MG, BISHOP_MG, ROOK_MG, QUEEN_MG, KING_MG];
const TABLES_EG = [[], PAWN_EG, KNIGHT_EG, BISHOP_EG, ROOK_EG, QUEEN_EG, KING_EG];

/**
 * Material plus placement per (piece code, 0x88 square), signed from White's view, so the hot
 * loop is one lookup per piece instead of a mirror and two table reads.
 */
const buildSquareScores = (material: number[], tables: number[][]): Int32Array => {
  const scores = new Int32Array(16 * 128);
  for (let type = PAWN; type <= KING; type++) {
    for (let square = 0; square < 128; square++) {
      if (square & 0x88) continue;
      const rank = square >> 4;
      const file = square & 7;
      const whiteIndex = (7 - rank) * 8 + file;
      const blackIndex = rank * 8 + file;
      scores[type * 128 + square] = material[type] + tables[type][whiteIndex];
      scores[(type | 8) * 128 + square] = -(material[type] + tables[type][blackIndex]);
    }
  }
  return scores;
};

const SQUARE_MG = buildSquareScores(MATERIAL_MG, TABLES_MG);
const SQUARE_EG = buildSquareScores(MATERIAL_EG, TABLES_EG);

const KNIGHT_OFFSETS = [33, 31, 18, 14, -33, -31, -18, -14];
const BISHOP_OFFSETS = [17, 15, -17, -15];
const ROOK_OFFSETS = [16, -16, 1, -1];
const QUEEN_OFFSETS = [17, 15, -17, -15, 16, -16, 1, -1];

/** Mobility weights per piece type, centred on a typical move count so the terms stay small. */
const MOBILITY_CENTRE = [0, 0, 4, 6, 7, 13, 0];
const MOBILITY_MG = [0, 0, 4, 5, 2, 1, 0];
const MOBILITY_EG = [0, 0, 4, 5, 4, 2, 0];

/** Passed pawn bonus by relative rank (0 = own back rank). */
const PASSED_MG = [0, 4, 8, 14, 24, 40, 60, 0];
const PASSED_EG = [0, 12, 18, 30, 52, 85, 125, 0];
const DOUBLED_MG = 10;
const DOUBLED_EG = 20;
const ISOLATED_MG = 12;
const ISOLATED_EG = 14;
const BISHOP_PAIR_MG = 28;
const BISHOP_PAIR_EG = 50;
const ROOK_OPEN_FILE_MG = 24;
const ROOK_OPEN_FILE_EG = 10;
const ROOK_SEMI_OPEN_MG = 12;
const ROOK_SEMI_OPEN_EG = 6;
const SHIELD_NEAR = 12;
const SHIELD_FAR = 6;
const TEMPO = 10;

// Scratch buffers reused across calls because evaluate runs at every leaf of the search.
const pawnCount = new Int8Array(16);
const whiteLowestRank = new Int8Array(8);
const blackHighestRank = new Int8Array(8);
const pawnSquares = new Int16Array(32);
const rookSquares = new Int16Array(40);

const countMobility = (board: Int8Array, from: number, offsets: number[], sliding: boolean, own: number): number => {
  let count = 0;
  for (let index = 0; index < offsets.length; index++) {
    const offset = offsets[index];
    for (let to = from + offset; (to & 0x88) === 0; to += offset) {
      const target = board[to];
      if (target) {
        if ((target >> 3) !== own) count += 1;
        break;
      }
      count += 1;
      if (!sliding) break;
    }
  }
  return count;
};

/** Pawns in front of a castled-style king, only meaningful while there is material to attack it. */
const kingShield = (board: Int8Array, kingSquare: number, color: number): number => {
  const forward = color === WHITE ? 16 : -16;
  const pawn = PAWN | (color << 3);
  let shield = 0;
  for (let fileStep = -1; fileStep <= 1; fileStep++) {
    const near = kingSquare + forward + fileStep;
    if (near & 0x88) continue;
    if (board[near] === pawn) shield += SHIELD_NEAR;
    else if (((near + forward) & 0x88) === 0 && board[near + forward] === pawn) shield += SHIELD_FAR;
  }
  return shield;
};

/**
 * Static evaluation in centipawns from the side to move's perspective. Positive means the side
 * to move is better. Deterministic and colour-symmetric: mirroring the board and swapping colours
 * gives exactly the same score.
 */
export const evaluate = (position: Position): number => {
  const board = position.board;
  let mg = 0;
  let eg = 0;
  let phase = 0;
  let pawnTotal = 0;
  let rookTotal = 0;
  let whiteBishops = 0;
  let blackBishops = 0;
  pawnCount.fill(0);
  whiteLowestRank.fill(8);
  blackHighestRank.fill(-1);

  for (let square = 0; square < 120; square++) {
    if (square & 0x88) {
      square += 7;
      continue;
    }
    const piece = board[square];
    if (!piece) continue;
    const type = piece & 7;
    const color = piece >> 3;
    const index = piece * 128 + square;
    mg += SQUARE_MG[index];
    eg += SQUARE_EG[index];
    phase += PHASE_WEIGHT[type];
    if (type === PAWN) {
      const file = square & 7;
      const rank = square >> 4;
      pawnCount[color * 8 + file] += 1;
      if (color === WHITE) {
        if (rank < whiteLowestRank[file]) whiteLowestRank[file] = rank;
      } else if (rank > blackHighestRank[file]) {
        blackHighestRank[file] = rank;
      }
      pawnSquares[pawnTotal++] = square | (color << 7);
      continue;
    }
    if (type === KING) continue;
    if (type === BISHOP) {
      if (color === WHITE) whiteBishops += 1;
      else blackBishops += 1;
    }
    if (type === ROOK) rookSquares[rookTotal++] = square | (color << 7);
    const offsets =
      type === KNIGHT ? KNIGHT_OFFSETS : type === BISHOP ? BISHOP_OFFSETS : type === ROOK ? ROOK_OFFSETS : QUEEN_OFFSETS;
    const mobility = countMobility(board, square, offsets, type !== KNIGHT, color) - MOBILITY_CENTRE[type];
    const sign = color === WHITE ? 1 : -1;
    mg += sign * mobility * MOBILITY_MG[type];
    eg += sign * mobility * MOBILITY_EG[type];
  }

  for (let index = 0; index < pawnTotal; index++) {
    const packed = pawnSquares[index];
    const square = packed & 0x7f;
    const color = packed >> 7;
    const file = square & 7;
    const rank = square >> 4;
    const sign = color === WHITE ? 1 : -1;
    const own = color * 8;
    const leftFile = file > 0 ? pawnCount[own + file - 1] : 0;
    const rightFile = file < 7 ? pawnCount[own + file + 1] : 0;
    if (leftFile === 0 && rightFile === 0) {
      mg -= sign * ISOLATED_MG;
      eg -= sign * ISOLATED_EG;
    }
    let passed = true;
    for (let adjacent = Math.max(0, file - 1); adjacent <= Math.min(7, file + 1); adjacent++) {
      if (color === WHITE ? blackHighestRank[adjacent] > rank : whiteLowestRank[adjacent] < rank) {
        passed = false;
        break;
      }
    }
    if (passed) {
      const relativeRank = color === WHITE ? rank : 7 - rank;
      mg += sign * PASSED_MG[relativeRank];
      eg += sign * PASSED_EG[relativeRank];
    }
  }

  for (let file = 0; file < 8; file++) {
    const whiteExtra = pawnCount[file] - 1;
    const blackExtra = pawnCount[8 + file] - 1;
    if (whiteExtra > 0) {
      mg -= whiteExtra * DOUBLED_MG;
      eg -= whiteExtra * DOUBLED_EG;
    }
    if (blackExtra > 0) {
      mg += blackExtra * DOUBLED_MG;
      eg += blackExtra * DOUBLED_EG;
    }
  }

  for (let index = 0; index < rookTotal; index++) {
    const packed = rookSquares[index];
    const file = packed & 7;
    const color = packed >> 7;
    const sign = color === WHITE ? 1 : -1;
    if (pawnCount[color * 8 + file] !== 0) continue;
    if (pawnCount[(color ^ 1) * 8 + file] === 0) {
      mg += sign * ROOK_OPEN_FILE_MG;
      eg += sign * ROOK_OPEN_FILE_EG;
    } else {
      mg += sign * ROOK_SEMI_OPEN_MG;
      eg += sign * ROOK_SEMI_OPEN_EG;
    }
  }

  if (whiteBishops >= 2) {
    mg += BISHOP_PAIR_MG;
    eg += BISHOP_PAIR_EG;
  }
  if (blackBishops >= 2) {
    mg -= BISHOP_PAIR_MG;
    eg -= BISHOP_PAIR_EG;
  }

  mg += kingShield(board, position.kingSquare[WHITE], WHITE) - kingShield(board, position.kingSquare[BLACK], BLACK);

  if (phase > MAX_PHASE) phase = MAX_PHASE;
  // Truncation toward zero keeps the blend exactly antisymmetric between the colours.
  const blended = Math.trunc((mg * phase + eg * (MAX_PHASE - phase)) / MAX_PHASE);
  return (position.turn === BLACK ? -blended : blended) + TEMPO;
};

/** True when the side to move has a piece other than pawns and king, so null-move pruning is safe. */
export const hasNonPawnMaterial = (position: Position): boolean => {
  const board = position.board;
  const own = position.turn;
  for (let square = 0; square < 120; square++) {
    if (square & 0x88) {
      square += 7;
      continue;
    }
    const piece = board[square];
    if (piece && piece >> 3 === own) {
      const type = piece & 7;
      if (type === KNIGHT || type === BISHOP || type === ROOK || type === QUEEN) return true;
    }
  }
  return false;
};
