import type { Position } from './position';
import { BISHOP, BLACK, EMPTY, KING, KNIGHT, PAWN, QUEEN, ROOK, WHITE } from './types';

const MATERIAL_MG = [0, 100, 320, 330, 500, 950, 0];
const MATERIAL_EG = [0, 115, 300, 320, 520, 980, 0];
const PHASE_WEIGHT = [0, 0, 1, 1, 2, 4, 0];
const MAX_PHASE = 24;

/** Piece-square tables in visual order: row 0 is rank 8 from white's point of view. */
const PST_PAWN = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const PST_KNIGHT = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];
const PST_BISHOP = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];
const PST_ROOK = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, 10, 10, 10, 10, 5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  0, 0, 0, 5, 5, 0, 0, 0,
];
const PST_QUEEN = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 5, 5, 5, 0, -5,
  0, 0, 5, 5, 5, 5, 0, -5,
  -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
];
const PST_KING_MG = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20,
];
const PST_KING_EG = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10, 0, 0, -10, -20, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -30, 0, 0, 0, 0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50,
];

const PASSED_MG = [0, 0, 5, 10, 20, 35, 60, 0];
const PASSED_EG = [0, 0, 10, 20, 40, 70, 120, 0];

/** Flattened [color][kind][square] tables with material folded in, so eval is one lookup per piece. */
const buildTables = (
  material: number[],
  tables: Record<number, number[]>,
): Int16Array => {
  const result = new Int16Array(2 * 7 * 64);
  for (const color of [WHITE, BLACK]) {
    for (let kind = PAWN; kind <= KING; kind++) {
      for (let sq = 0; sq < 64; sq++) {
        // White reads the visual table flipped vertically; black already sees it from its own side.
        const tableIndex = color === WHITE ? sq ^ 56 : sq;
        result[(color * 7 + kind) * 64 + sq] = material[kind] + tables[kind][tableIndex];
      }
    }
  }
  return result;
};

const MG_TABLE = buildTables(MATERIAL_MG, {
  [PAWN]: PST_PAWN, [KNIGHT]: PST_KNIGHT, [BISHOP]: PST_BISHOP,
  [ROOK]: PST_ROOK, [QUEEN]: PST_QUEEN, [KING]: PST_KING_MG,
});
const EG_TABLE = buildTables(MATERIAL_EG, {
  [PAWN]: PST_PAWN, [KNIGHT]: PST_KNIGHT, [BISHOP]: PST_BISHOP,
  [ROOK]: PST_ROOK, [QUEEN]: PST_QUEEN, [KING]: PST_KING_EG,
});

const TEMPO = 8;

// Scratch buffers reused across calls: evaluation runs at every leaf, so it must not allocate.
// Pawn arrays are indexed [color * 10 + file + 1] so file -1 and 8 are valid sentinels.
const pawnCount = new Int8Array(20);
const pawnMinRank = new Int8Array(20);
const pawnMaxRank = new Int8Array(20);
const pawnSquares = new Int8Array(2 * 16);
const pawnTotal = new Int8Array(2);
const rookSquares = new Int8Array(2 * 16);
const rookTotal = new Int8Array(2);
const bishopTotal = new Int8Array(2);
const minorTotal = new Int8Array(2);
const majorTotal = new Int8Array(2);

const centerDistance = (sq: number): number => {
  const file = sq & 7;
  const rank = sq >> 3;
  return Math.max(3 - file, file - 4) + Math.max(3 - rank, rank - 4);
};

const kingDistance = (a: number, b: number): number =>
  Math.abs((a & 7) - (b & 7)) + Math.abs((a >> 3) - (b >> 3));

/** Pawn cover in front of the king, in centipawns from that king's side. */
const pawnShield = (pos: Position, color: number): number => {
  const kingSq = pos.kingSquare[color];
  const relRank = color === WHITE ? kingSq >> 3 : 7 - (kingSq >> 3);
  if (relRank > 1) return 0;
  const forward = color === WHITE ? 8 : -8;
  const ownPawn = PAWN | (color << 3);
  const kingFile = kingSq & 7;
  let score = 0;
  for (let df = -1; df <= 1; df++) {
    const file = kingFile + df;
    if (file < 0 || file > 7) continue;
    const near = kingSq + forward + df;
    if (pos.board[near] === ownPawn) score += 12;
    else if (pos.board[near + forward] === ownPawn) score += 6;
    else score -= 12;
    if (pawnCount[color * 10 + file + 1] === 0) score -= 8;
  }
  return score;
};

/**
 * Static evaluation in centipawns from the side to move's perspective.
 * Tapered between a midgame and an endgame score by remaining non-pawn material.
 */
export const evaluate = (pos: Position): number => {
  const board = pos.board;
  pawnCount.fill(0);
  pawnMinRank.fill(8);
  pawnMaxRank.fill(-1);
  pawnTotal.fill(0);
  rookTotal.fill(0);
  bishopTotal.fill(0);
  minorTotal.fill(0);
  majorTotal.fill(0);

  let mg = 0;
  let eg = 0;
  let phase = 0;
  let material = 0;

  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (piece === EMPTY) continue;
    const kind = piece & 7;
    const color = piece >> 3;
    const index = (color * 7 + kind) * 64 + sq;
    if (color === WHITE) {
      mg += MG_TABLE[index];
      eg += EG_TABLE[index];
      if (kind !== KING) material += MATERIAL_EG[kind];
    } else {
      mg -= MG_TABLE[index];
      eg -= EG_TABLE[index];
      if (kind !== KING) material -= MATERIAL_EG[kind];
    }
    phase += PHASE_WEIGHT[kind];

    switch (kind) {
      case PAWN: {
        const slot = color * 10 + (sq & 7) + 1;
        const rank = sq >> 3;
        pawnCount[slot]++;
        if (rank < pawnMinRank[slot]) pawnMinRank[slot] = rank;
        if (rank > pawnMaxRank[slot]) pawnMaxRank[slot] = rank;
        pawnSquares[color * 16 + pawnTotal[color]++] = sq;
        break;
      }
      case KNIGHT:
        minorTotal[color]++;
        break;
      case BISHOP:
        minorTotal[color]++;
        bishopTotal[color]++;
        break;
      case ROOK:
        majorTotal[color]++;
        rookSquares[color * 16 + rookTotal[color]++] = sq;
        break;
      case QUEEN:
        majorTotal[color]++;
        break;
    }
  }

  if (
    pawnTotal[WHITE] + pawnTotal[BLACK] + majorTotal[WHITE] + majorTotal[BLACK] === 0 &&
    minorTotal[WHITE] + minorTotal[BLACK] <= 1
  ) {
    return 0;
  }

  for (let color = WHITE; color <= BLACK; color++) {
    const sign = color === WHITE ? 1 : -1;
    const enemyBase = (color ^ 1) * 10;
    let mgTerm = 0;
    let egTerm = 0;

    for (let i = 0; i < pawnTotal[color]; i++) {
      const sq = pawnSquares[color * 16 + i];
      const file = sq & 7;
      const rank = sq >> 3;
      const slot = color * 10 + file + 1;
      const relRank = color === WHITE ? rank : 7 - rank;

      let passed = true;
      for (let df = -1; df <= 1; df++) {
        const enemySlot = enemyBase + file + 1 + df;
        const blocked =
          color === WHITE ? pawnMaxRank[enemySlot] > rank : pawnMinRank[enemySlot] < rank;
        if (blocked) {
          passed = false;
          break;
        }
      }
      if (passed) {
        mgTerm += PASSED_MG[relRank];
        egTerm += PASSED_EG[relRank];
      }
      if (pawnCount[slot - 1] === 0 && pawnCount[slot + 1] === 0) {
        mgTerm -= 12;
        egTerm -= 18;
      }
      // Penalize every pawn except the rearmost one on a file.
      const rearmost = color === WHITE ? pawnMinRank[slot] === rank : pawnMaxRank[slot] === rank;
      if (pawnCount[slot] > 1 && !rearmost) {
        mgTerm -= 8;
        egTerm -= 14;
      }
    }

    for (let i = 0; i < rookTotal[color]; i++) {
      const file = rookSquares[color * 16 + i] & 7;
      if (pawnCount[color * 10 + file + 1] === 0) {
        if (pawnCount[enemyBase + file + 1] === 0) {
          mgTerm += 22;
          egTerm += 12;
        } else {
          mgTerm += 10;
          egTerm += 6;
        }
      }
    }

    if (bishopTotal[color] >= 2) {
      mgTerm += 30;
      egTerm += 50;
    }
    mgTerm += pawnShield(pos, color);

    mg += sign * mgTerm;
    eg += sign * egTerm;
  }

  const taper = phase > MAX_PHASE ? MAX_PHASE : phase;
  let score = Math.trunc((mg * taper + eg * (MAX_PHASE - taper)) / MAX_PHASE);

  // Mop-up: with a decisive edge in a sparse endgame, drive the bare king to the edge and close in.
  if (taper <= 10 && (material >= 300 || material <= -300)) {
    const winner = material > 0 ? WHITE : BLACK;
    const loserKing = pos.kingSquare[winner ^ 1];
    const bonus = centerDistance(loserKing) * 20 + (14 - kingDistance(loserKing, pos.kingSquare[winner])) * 8;
    score += winner === WHITE ? bonus : -bonus;
  }

  return (pos.turn === WHITE ? score : -score) + TEMPO;
};
