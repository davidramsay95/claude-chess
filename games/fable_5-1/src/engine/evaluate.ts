import {
  BISHOP,
  BLACK,
  EMPTY,
  KING,
  PAWN,
  WHITE,
  fileOf,
  isOnBoard,
  pieceColorOf,
  pieceTypeOf,
  rankOf,
  squareOf,
} from "./types";
import type { Position } from "./position";

/** Material values in centipawns indexed by piece type. */
export const PIECE_VALUE = new Int32Array([0, 100, 320, 330, 500, 900, 0]);

const BISHOP_PAIR_BONUS = 30;
const DOUBLED_PAWN_PENALTY = 15;
const ISOLATED_PAWN_PENALTY = 15;
/** Indexed by the pawn's rank relative to its own side (rank 0 and 7 are impossible for pawns). */
const PASSED_PAWN_BONUS = [0, 10, 15, 25, 40, 60, 90, 0];

/** Game phase contribution of each piece type; the sum over all non-pawn pieces is 24 at the start. */
const PHASE_WEIGHT = new Int32Array([0, 0, 1, 1, 2, 4, 0]);
const TOTAL_PHASE = 24;

/*
 * Piece-square tables are written from white's point of view with rank 8 on the first row,
 * the way a board is normally drawn, so they read naturally. They are flipped into 0x88
 * layout for both colours at module load.
 */
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

const KING_MIDDLEGAME_TABLE = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20,
];

const KING_ENDGAME_TABLE = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10, 0, 0, -10, -20, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -30, 0, 0, 0, 0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50,
];

/** Converts a drawn-board table into 0x88 layout for a given colour. */
const toBoardTable = (table: number[], color: number): Int16Array => {
  const out = new Int16Array(128);
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const drawnRow = color === WHITE ? 7 - rank : rank;
      out[squareOf(file, rank)] = table[drawnRow * 8 + file];
    }
  }
  return out;
};

/** PST[color][type] for the five non-king pieces; index 0 and KING are unused fillers. */
const PST: Int16Array[][] = [[], []];
/** King tables are looked up separately because they are tapered between the two game phases. */
const KING_PST_MG: Int16Array[] = [];
const KING_PST_EG: Int16Array[] = [];
for (const color of [WHITE, BLACK]) {
  const empty = new Int16Array(128);
  PST[color] = [
    empty,
    toBoardTable(PAWN_TABLE, color),
    toBoardTable(KNIGHT_TABLE, color),
    toBoardTable(BISHOP_TABLE, color),
    toBoardTable(ROOK_TABLE, color),
    toBoardTable(QUEEN_TABLE, color),
    empty,
  ];
  KING_PST_MG[color] = toBoardTable(KING_MIDDLEGAME_TABLE, color);
  KING_PST_EG[color] = toBoardTable(KING_ENDGAME_TABLE, color);
}

/*
 * Scratch state reused across calls so evaluation allocates nothing. Pawn files are padded
 * by one on each side so adjacent-file lookups need no bounds checks.
 */
const pawnsOnFile = [new Int8Array(10), new Int8Array(10)];
/** Least advanced white pawn per file (8 = none), most advanced black pawn per file (-1 = none). */
const whiteRearmostRank = new Int8Array(10);
const blackRearmostRank = new Int8Array(10);
const pawnSquares = [new Int8Array(8), new Int8Array(8)];
const pawnCounts = new Int8Array(2);

const resetPawnScratch = (): void => {
  pawnsOnFile[WHITE].fill(0);
  pawnsOnFile[BLACK].fill(0);
  whiteRearmostRank.fill(8);
  blackRearmostRank.fill(-1);
  pawnCounts[WHITE] = 0;
  pawnCounts[BLACK] = 0;
};

const pawnStructureScore = (color: number): number => {
  const files = pawnsOnFile[color];
  const squares = pawnSquares[color];
  let score = 0;
  for (let i = 0; i < pawnCounts[color]; i++) {
    const sq = squares[i];
    const file = fileOf(sq) + 1;
    const rank = rankOf(sq);
    if (files[file] > 1) score -= DOUBLED_PAWN_PENALTY;
    if (files[file - 1] === 0 && files[file + 1] === 0) score -= ISOLATED_PAWN_PENALTY;
    if (color === WHITE) {
      const blocked =
        blackRearmostRank[file - 1] > rank ||
        blackRearmostRank[file] > rank ||
        blackRearmostRank[file + 1] > rank;
      if (!blocked) score += PASSED_PAWN_BONUS[rank];
    } else {
      const blocked =
        whiteRearmostRank[file - 1] < rank ||
        whiteRearmostRank[file] < rank ||
        whiteRearmostRank[file + 1] < rank;
      if (!blocked) score += PASSED_PAWN_BONUS[7 - rank];
    }
  }
  return score;
};

/**
 * Static evaluation in centipawns from the perspective of the side to move.
 * Positive means the side to move is better.
 */
export const evaluate = (pos: Position): number => {
  const board = pos.board;
  resetPawnScratch();
  let material = 0;
  let placement = 0;
  let phase = 0;
  let whiteBishops = 0;
  let blackBishops = 0;
  let whiteKing = 0;
  let blackKing = 0;

  for (let sq = 0; sq < 128; sq++) {
    if (!isOnBoard(sq)) {
      sq += 7;
      continue;
    }
    const piece = board[sq];
    if (piece === EMPTY) continue;
    const type = pieceTypeOf(piece);
    const color = pieceColorOf(piece);
    const sign = color === WHITE ? 1 : -1;
    phase += PHASE_WEIGHT[type];
    if (type === KING) {
      if (color === WHITE) whiteKing = sq;
      else blackKing = sq;
      continue;
    }
    material += sign * PIECE_VALUE[type];
    placement += sign * PST[color][type][sq];
    if (type === PAWN) {
      const file = fileOf(sq) + 1;
      const rank = rankOf(sq);
      pawnsOnFile[color][file]++;
      pawnSquares[color][pawnCounts[color]++] = sq;
      if (color === WHITE) {
        if (rank < whiteRearmostRank[file]) whiteRearmostRank[file] = rank;
      } else if (rank > blackRearmostRank[file]) {
        blackRearmostRank[file] = rank;
      }
    } else if (type === BISHOP) {
      if (color === WHITE) whiteBishops++;
      else blackBishops++;
    }
  }

  // Blend king placement from the middlegame table toward the endgame table as pieces come off.
  const mgPhase = Math.min(phase, TOTAL_PHASE);
  const egPhase = TOTAL_PHASE - mgPhase;
  const kingScore =
    (KING_PST_MG[WHITE][whiteKing] - KING_PST_MG[BLACK][blackKing]) * mgPhase +
    (KING_PST_EG[WHITE][whiteKing] - KING_PST_EG[BLACK][blackKing]) * egPhase;
  placement += Math.trunc(kingScore / TOTAL_PHASE);

  let structure = pawnStructureScore(WHITE) - pawnStructureScore(BLACK);
  if (whiteBishops >= 2) structure += BISHOP_PAIR_BONUS;
  if (blackBishops >= 2) structure -= BISHOP_PAIR_BONUS;

  const whiteScore = material + placement + structure;
  return pos.turn === WHITE ? whiteScore : -whiteScore;
};
