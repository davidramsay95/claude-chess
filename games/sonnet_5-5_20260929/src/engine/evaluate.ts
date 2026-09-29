import { BISHOP, KING, KNIGHT, PAWN, Position, QUEEN, ROOK, WHITE } from "./position";

/** Piece values in centipawns, indexed by piece type. */
export const PIECE_VALUE = [0, 100, 320, 330, 500, 900, 0];

// Piece-square tables written from White's point of view, a8 first, so they read like a board.
const TABLES: Record<number, number[]> = {
  [PAWN]: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  [KNIGHT]: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15,
    20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  [BISHOP]: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10,
    5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10,
    -10, -10, -10, -10, -10, -20,
  ],
  [ROOK]: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0,
    0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0,
  ],
  [QUEEN]: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0,
    -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10,
    -10, -20,
  ],
};

const KING_MIDDLEGAME = [
  -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40,
  -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20,
  -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20,
];

const KING_ENDGAME = [
  -50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30,
  -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0,
  0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50,
];

/** Per-piece, per-square scores including material, from the owning side's point of view. */
const buildTables = (endgame: boolean): Int32Array => {
  const result = new Int32Array(15 * 128);
  for (let type = PAWN; type <= KING; type++) {
    const table = type === KING ? (endgame ? KING_ENDGAME : KING_MIDDLEGAME) : TABLES[type];
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const square = rank * 16 + file;
        result[type * 128 + square] = PIECE_VALUE[type] + table[(7 - rank) * 8 + file];
        result[(type | 8) * 128 + square] = PIECE_VALUE[type] + table[rank * 8 + file];
      }
    }
  }
  return result;
};

const MIDDLEGAME = buildTables(false);
const ENDGAME = buildTables(true);

const PHASE_WEIGHT = [0, 0, 1, 1, 2, 4, 0];
const PASSED_PAWN_BONUS = [0, 5, 10, 20, 35, 60, 100, 0];

const SQUARES: number[] = [];
for (let rank = 0; rank < 8; rank++) {
  for (let file = 0; file < 8; file++) SQUARES.push(rank * 16 + file);
}

// Scratch buffers reused between calls; the evaluator is not re-entrant.
const pawnCount = [new Int32Array(10), new Int32Array(10)];
const pawnRearmost = [new Int32Array(10), new Int32Array(10)];
const pawnSquares: number[][] = [[], []];
const rookSquares: number[][] = [[], []];

/** Static score in centipawns from the point of view of the side to move. */
export const evaluate = (position: Position): number => {
  const board = position.board;
  let middle = 0;
  let end = 0;
  let phase = 0;
  const bishops = [0, 0];
  const kings = [-1, -1];
  for (let color = 0; color < 2; color++) {
    pawnCount[color].fill(0);
    pawnRearmost[color].fill(8);
    pawnSquares[color].length = 0;
    rookSquares[color].length = 0;
  }

  for (const square of SQUARES) {
    const piece = board[square];
    if (piece === 0) continue;
    const color = piece >> 3;
    const type = piece & 7;
    const sign = color === WHITE ? 1 : -1;
    middle += sign * MIDDLEGAME[piece * 128 + square];
    end += sign * ENDGAME[piece * 128 + square];
    phase += PHASE_WEIGHT[type];

    if (type === PAWN) {
      const file = (square & 7) + 1;
      const advance = color === WHITE ? square >> 4 : 7 - (square >> 4);
      pawnCount[color][file]++;
      if (advance < pawnRearmost[color][file]) pawnRearmost[color][file] = advance;
      pawnSquares[color].push(square);
    } else if (type === BISHOP) {
      bishops[color]++;
    } else if (type === ROOK) {
      rookSquares[color].push(square);
    } else if (type === KING) {
      kings[color] = square;
    }
  }

  let structure = 0;
  for (let color = 0; color < 2; color++) {
    const sign = color === WHITE ? 1 : -1;
    const enemy = color ^ 1;
    let score = 0;
    if (bishops[color] >= 2) score += 30;

    for (let file = 1; file <= 8; file++) {
      const count = pawnCount[color][file];
      if (count > 1) score -= 10 * (count - 1);
      if (count > 0 && pawnCount[color][file - 1] === 0 && pawnCount[color][file + 1] === 0) score -= 12 * count;
    }

    for (const square of pawnSquares[color]) {
      const file = (square & 7) + 1;
      const advance = color === WHITE ? square >> 4 : 7 - (square >> 4);
      // Passed: no enemy pawn on this or adjacent files that is still ahead of it.
      // An enemy pawn's furthest advance is measured from its own side, so mirror it.
      let passed = true;
      for (let f = file - 1; f <= file + 1 && passed; f++) {
        if (pawnCount[enemy][f] > 0 && 7 - pawnRearmost[enemy][f] > advance) passed = false;
      }
      if (passed) score += PASSED_PAWN_BONUS[advance];
    }

    for (const square of rookSquares[color]) {
      const file = (square & 7) + 1;
      if (pawnCount[color][file] === 0) score += pawnCount[enemy][file] === 0 ? 18 : 10;
    }

    const king = kings[color];
    if (king >= 0) {
      const forward = color === WHITE ? 16 : -16;
      let shield = 0;
      for (let step = 1; step <= 2; step++) {
        for (let side = -1; side <= 1; side++) {
          const target = king + forward * step + side;
          if ((target & 0x88) === 0 && board[target] === (PAWN | (color << 3))) shield += step === 1 ? 10 : 5;
        }
      }
      // Weighted by the phase below so it fades away in endgames.
      middle += sign * shield;
    }
    structure += sign * score;
  }

  const capped = Math.min(phase, 24);
  const blended = Math.round((middle * capped + end * (24 - capped)) / 24) + structure;
  return (position.side === WHITE ? blended : -blended) + 10;
};

export const hasNonPawnMaterial = (position: Position, color: number): boolean => {
  for (const square of SQUARES) {
    const piece = position.board[square];
    if (piece === 0 || piece >> 3 !== color) continue;
    const type = piece & 7;
    if (type !== PAWN && type !== KING) return true;
  }
  return false;
};
