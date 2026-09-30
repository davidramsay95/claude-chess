/**
 * A hand-written tapered evaluation. Every term carries a midgame and an
 * endgame value; the two are blended by a phase counter so the same function
 * gives sane advice in a Sicilian and in a king-and-pawn ending.
 *
 * Scores are always returned from the point of view of the side to move, which
 * is what negamax expects.
 */

import {
  BISHOP,
  BLACK,
  KING,
  KNIGHT,
  PAWN,
  Position,
  QUEEN,
  ROOK,
  WHITE,
  fileOf,
  rankOf,
} from "./position.ts";

const MG_MATERIAL = [0, 88, 340, 356, 510, 1010, 0];
const EG_MATERIAL = [0, 112, 300, 330, 550, 985, 0];
const PHASE_WEIGHT = [0, 0, 1, 1, 2, 4, 0];
const TOTAL_PHASE = 24;

/** Tables are written rank 8 first, as the board looks from White's chair. */
function table(rows: number[]): Int16Array {
  const board = new Int16Array(128);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      board[(7 - row) * 16 + col] = rows[row * 8 + col];
    }
  }
  return board;
}

const PAWN_MG = table([
  0, 0, 0, 0, 0, 0, 0, 0,
  90, 90, 90, 90, 90, 90, 90, 90,
  32, 36, 46, 56, 56, 46, 36, 32,
  14, 18, 26, 42, 42, 24, 18, 14,
  4, 6, 12, 30, 30, 10, 6, 4,
  2, 0, 0, 10, 10, -4, 2, 2,
  4, 8, 8, -22, -22, 10, 8, 4,
  0, 0, 0, 0, 0, 0, 0, 0,
]);
const PAWN_EG = table([
  0, 0, 0, 0, 0, 0, 0, 0,
  130, 126, 120, 112, 112, 120, 126, 130,
  78, 74, 64, 54, 54, 62, 74, 78,
  38, 34, 26, 20, 20, 24, 34, 38,
  16, 14, 8, 6, 6, 8, 14, 16,
  4, 6, 2, 2, 2, 2, 6, 4,
  6, 4, 6, 6, 6, 6, 4, 6,
  0, 0, 0, 0, 0, 0, 0, 0,
]);
const KNIGHT_PST = table([
  -60, -40, -24, -18, -18, -24, -40, -60,
  -36, -16, 4, 8, 8, 4, -16, -36,
  -20, 8, 24, 30, 30, 24, 8, -20,
  -14, 12, 30, 38, 38, 30, 12, -14,
  -14, 8, 28, 36, 36, 28, 8, -14,
  -20, 6, 22, 26, 26, 22, 6, -20,
  -36, -18, 2, 8, 8, 2, -18, -36,
  -64, -36, -22, -14, -14, -22, -36, -64,
]);
const BISHOP_PST = table([
  -22, -12, -10, -10, -10, -10, -12, -22,
  -10, 4, 2, 0, 0, 2, 4, -10,
  -8, 6, 12, 12, 12, 12, 6, -8,
  -6, 4, 14, 20, 20, 14, 4, -6,
  -6, 8, 14, 20, 20, 14, 8, -6,
  -8, 14, 14, 14, 14, 14, 14, -8,
  -10, 16, 6, 6, 6, 6, 16, -10,
  -22, -10, -14, -8, -8, -14, -10, -22,
]);
const ROOK_PST = table([
  6, 10, 12, 14, 14, 12, 10, 6,
  14, 20, 22, 24, 24, 22, 20, 14,
  -2, 2, 6, 8, 8, 6, 2, -2,
  -6, -2, 2, 4, 4, 2, -2, -6,
  -8, -4, 0, 2, 2, 0, -4, -8,
  -10, -4, 0, 2, 2, 0, -4, -10,
  -12, -6, 0, 4, 4, 0, -6, -12,
  -6, -4, 4, 12, 12, 4, -4, -6,
]);
const QUEEN_PST = table([
  -18, -10, -8, -4, -4, -8, -10, -18,
  -10, 0, 4, 4, 4, 4, 0, -10,
  -8, 4, 8, 8, 8, 8, 4, -8,
  -4, 4, 8, 10, 10, 8, 4, -4,
  -4, 6, 8, 10, 10, 8, 6, -4,
  -8, 6, 8, 8, 8, 8, 6, -8,
  -10, 0, 6, 4, 4, 4, 0, -10,
  -18, -10, -8, -2, -4, -8, -10, -18,
]);
const KING_MG = table([
  -56, -60, -60, -64, -64, -60, -60, -56,
  -52, -56, -58, -62, -62, -58, -56, -52,
  -44, -50, -54, -58, -58, -54, -50, -44,
  -36, -42, -48, -54, -54, -48, -42, -36,
  -24, -32, -38, -44, -44, -38, -32, -24,
  -12, -18, -24, -28, -28, -24, -18, -12,
  14, 14, -6, -10, -10, -6, 14, 14,
  20, 32, 10, -8, 0, -6, 34, 20,
]);
const KING_EG = table([
  -56, -30, -16, -8, -8, -16, -30, -56,
  -24, -4, 10, 18, 18, 10, -4, -24,
  -12, 16, 30, 36, 36, 30, 16, -12,
  -10, 20, 36, 44, 44, 36, 20, -10,
  -12, 18, 34, 42, 42, 34, 18, -12,
  -16, 10, 24, 30, 30, 24, 10, -16,
  -28, -6, 6, 12, 12, 6, -6, -28,
  -58, -34, -22, -14, -14, -22, -34, -58,
]);

const PASSED_PAWN_MG = [0, 4, 8, 18, 34, 58, 92, 0];
const PASSED_PAWN_EG = [0, 10, 20, 38, 68, 110, 160, 0];
const BISHOP_PAIR_MG = 34;
const BISHOP_PAIR_EG = 52;
const DOUBLED_PAWN = -14;
const ISOLATED_PAWN = -16;
const ROOK_OPEN_FILE = 22;
const ROOK_SEMI_OPEN_FILE = 11;
const MOBILITY_MG = [0, 0, 4, 5, 3, 1, 0];
const MOBILITY_EG = [0, 0, 4, 5, 5, 3, 0];
const KING_SHIELD = 12;
const TEMPO = 12;

const BISHOP_DIRS = [17, 15, -15, -17];
const ROOK_DIRS = [16, 1, -1, -16];
const QUEEN_DIRS = [17, 16, 15, 1, -1, -15, -16, -17];

/** Mirrors a square so Black's pieces read the same tables as White's. */
function flip(square: number): number {
  return (7 - rankOf(square)) * 16 + fileOf(square);
}

/** Material and piece-square tables only: the weakest level plays on this. */
export function evaluateMaterial(pos: Position): number {
  let mg = 0;
  let eg = 0;
  let phase = 0;
  for (let square = 0; square < 128; square++) {
    if (square & 0x88) continue;
    const piece = pos.board[square];
    if (!piece) continue;
    const type = piece & 7;
    const white = ((piece >> 3) & 1) === WHITE;
    const view = white ? square : flip(square);
    const sign = white ? 1 : -1;
    phase += PHASE_WEIGHT[type];
    mg += sign * (MG_MATERIAL[type] + pstMg(type, view));
    eg += sign * (EG_MATERIAL[type] + pstEg(type, view));
  }
  return taper(pos, mg, eg, phase);
}

export function evaluate(pos: Position): number {
  let mg = 0;
  let eg = 0;
  let phase = 0;

  // Per colour, per file: how many pawns, and the rank of the most advanced one
  // measured from that colour's own side of the board.
  const pawnCount = [new Int8Array(8), new Int8Array(8)];
  const pawnFront = [new Int8Array(8).fill(-1), new Int8Array(8).fill(-1)];
  const bishops = [0, 0];

  for (let square = 0; square < 128; square++) {
    if (square & 0x88) continue;
    const piece = pos.board[square];
    if (!piece) continue;
    const type = piece & 7;
    const colour = (piece >> 3) & 1;
    const white = colour === WHITE;
    const view = white ? square : flip(square);
    const sign = white ? 1 : -1;
    phase += PHASE_WEIGHT[type];
    mg += sign * (MG_MATERIAL[type] + pstMg(type, view));
    eg += sign * (EG_MATERIAL[type] + pstEg(type, view));

    if (type === PAWN) {
      const file = fileOf(square);
      const advance = white ? rankOf(square) : 7 - rankOf(square);
      pawnCount[colour][file]++;
      if (advance > pawnFront[colour][file]) pawnFront[colour][file] = advance;
    } else if (type === BISHOP) {
      bishops[colour]++;
    }

    if (type === KNIGHT || type === BISHOP || type === ROOK || type === QUEEN) {
      const moves = mobility(pos, square, type);
      mg += sign * moves * MOBILITY_MG[type];
      eg += sign * moves * MOBILITY_EG[type];
    }

    if (type === ROOK) {
      const file = fileOf(square);
      const ourPawns = pawnsOnFile(pos, file, colour);
      const theirPawns = pawnsOnFile(pos, file, 1 - colour);
      if (ourPawns === 0) {
        const bonus = theirPawns === 0 ? ROOK_OPEN_FILE : ROOK_SEMI_OPEN_FILE;
        mg += sign * bonus;
        eg += sign * (bonus >> 1);
      }
    }
  }

  for (const colour of [WHITE, BLACK] as const) {
    const sign = colour === WHITE ? 1 : -1;
    const them = 1 - colour;
    for (let file = 0; file < 8; file++) {
      const count = pawnCount[colour][file];
      if (count === 0) continue;
      if (count > 1) {
        mg += sign * DOUBLED_PAWN * (count - 1);
        eg += sign * DOUBLED_PAWN * (count - 1);
      }
      const leftEmpty = file === 0 || pawnCount[colour][file - 1] === 0;
      const rightEmpty = file === 7 || pawnCount[colour][file + 1] === 0;
      if (leftEmpty && rightEmpty) {
        mg += sign * ISOLATED_PAWN;
        eg += sign * ISOLATED_PAWN;
      }
      const advance = pawnFront[colour][file];
      const blockedBy = Math.max(
        file === 0 ? -1 : mirrorAdvance(pawnFront[them][file - 1]),
        mirrorAdvance(pawnFront[them][file]),
        file === 7 ? -1 : mirrorAdvance(pawnFront[them][file + 1]),
      );
      if (advance > blockedBy) {
        mg += sign * PASSED_PAWN_MG[advance];
        eg += sign * PASSED_PAWN_EG[advance];
      }
    }
    if (bishops[colour] >= 2) {
      mg += sign * BISHOP_PAIR_MG;
      eg += sign * BISHOP_PAIR_EG;
    }
    mg += sign * kingShield(pos, colour) * KING_SHIELD;
  }

  return taper(pos, mg, eg, phase);
}

/** Converts an opposing pawn's own-side advance into our own frame. */
function mirrorAdvance(advance: number): number {
  return advance === -1 ? -1 : 7 - advance;
}

function pstMg(type: number, square: number): number {
  switch (type) {
    case PAWN:
      return PAWN_MG[square];
    case KNIGHT:
      return KNIGHT_PST[square];
    case BISHOP:
      return BISHOP_PST[square];
    case ROOK:
      return ROOK_PST[square];
    case QUEEN:
      return QUEEN_PST[square];
    default:
      return KING_MG[square];
  }
}

function pstEg(type: number, square: number): number {
  switch (type) {
    case PAWN:
      return PAWN_EG[square];
    case KING:
      return KING_EG[square];
    default:
      return pstMg(type, square);
  }
}

function taper(pos: Position, mg: number, eg: number, phase: number): number {
  const clamped = Math.min(phase, TOTAL_PHASE);
  const blended = Math.round((mg * clamped + eg * (TOTAL_PHASE - clamped)) / TOTAL_PHASE);
  return (pos.turn === WHITE ? blended : -blended) + TEMPO;
}

function pawnsOnFile(pos: Position, file: number, colour: number): number {
  let count = 0;
  for (let rank = 1; rank < 7; rank++) {
    const piece = pos.board[rank * 16 + file];
    if (piece && (piece & 7) === PAWN && ((piece >> 3) & 1) === colour) count++;
  }
  return count;
}

function mobility(pos: Position, square: number, type: number): number {
  if (type === KNIGHT) {
    let count = 0;
    for (const dir of [33, 31, 18, 14, -33, -31, -18, -14]) {
      const to = square + dir;
      if ((to & 0x88) === 0 && pos.board[to] === 0) count++;
    }
    return count;
  }
  const dirs = type === BISHOP ? BISHOP_DIRS : type === ROOK ? ROOK_DIRS : QUEEN_DIRS;
  let count = 0;
  for (const dir of dirs) {
    for (let to = square + dir; (to & 0x88) === 0; to += dir) {
      if (pos.board[to] !== 0) break;
      count++;
    }
  }
  return count;
}

/** Friendly pawns directly in front of the king, capped so it stays a nudge. */
function kingShield(pos: Position, colour: number): number {
  const king = pos.kingSquare[colour];
  const home = colour === WHITE ? rankOf(king) <= 1 : rankOf(king) >= 6;
  if (!home) return 0;
  const forward = colour === WHITE ? 16 : -16;
  let shield = 0;
  for (const side of [-1, 0, 1]) {
    const square = king + forward + side;
    if (square & 0x88) continue;
    const piece = pos.board[square];
    if (piece && (piece & 7) === PAWN && ((piece >> 3) & 1) === colour) shield++;
  }
  return shield;
}
