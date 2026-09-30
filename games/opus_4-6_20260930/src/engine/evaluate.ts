import { ChessGame } from "../chess/game.js";
import {
  WHITE, BLACK, PAWN, BISHOP, ROOK, QUEEN,
  pieceType, pieceColor, sqRank, sqFile, sq88, isOnBoard,
  makePiece,
} from "../chess/types.js";
import { generatePseudoLegal } from "../chess/moves.js";

const MATERIAL = [0, 100, 320, 330, 500, 900, 20000];
const PHASE_WEIGHT = [0, 0, 1, 1, 2, 4, 0];
const TOTAL_PHASE = 24;

function make88Table(cpw: readonly number[]): Int16Array {
  const table = new Int16Array(128);
  for (let i = 0; i < 64; i++) {
    const rank = 7 - (i >> 3);
    const file = i & 7;
    table[sq88(rank, file)] = cpw[i];
  }
  return table;
}

function mirrorSq(sq: number): number {
  return sq88(7 - sqRank(sq), sqFile(sq));
}

const PAWN_MG = make88Table([
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0,
]);

const PAWN_EG = make88Table([
   0,  0,  0,  0,  0,  0,  0,  0,
  80, 80, 80, 80, 80, 80, 80, 80,
  50, 50, 50, 50, 50, 50, 50, 50,
  30, 30, 30, 30, 30, 30, 30, 30,
  20, 20, 20, 20, 20, 20, 20, 20,
  10, 10, 10, 10, 10, 10, 10, 10,
  10, 10, 10, 10, 10, 10, 10, 10,
   0,  0,  0,  0,  0,  0,  0,  0,
]);

const KNIGHT_PST = make88Table([
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
]);

const BISHOP_PST = make88Table([
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20,
]);

const ROOK_PST = make88Table([
   0,  0,  0,  0,  0,  0,  0,  0,
   5, 10, 10, 10, 10, 10, 10,  5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   0,  0,  0,  5,  5,  0,  0,  0,
]);

const QUEEN_PST = make88Table([
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5,  5,  5,  5,  0,-10,
   -5,  0,  5,  5,  5,  5,  0, -5,
    0,  0,  5,  5,  5,  5,  0, -5,
  -10,  5,  5,  5,  5,  5,  0,-10,
  -10,  0,  5,  0,  0,  0,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20,
]);

const KING_MG = make88Table([
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
   20, 20,  0,  0,  0,  0, 20, 20,
   20, 30, 10,  0,  0, 10, 30, 20,
]);

const KING_EG = make88Table([
  -50,-40,-30,-20,-20,-30,-40,-50,
  -30,-20,-10,  0,  0,-10,-20,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-30,  0,  0,  0,  0,-30,-30,
  -50,-30,-30,-30,-30,-30,-30,-50,
]);

const MG_TABLES: (Int16Array | null)[] = [
  null, PAWN_MG, KNIGHT_PST, BISHOP_PST, ROOK_PST, QUEEN_PST, KING_MG,
];
const EG_TABLES: (Int16Array | null)[] = [
  null, PAWN_EG, KNIGHT_PST, BISHOP_PST, ROOK_PST, QUEEN_PST, KING_EG,
];

const PASSED_PAWN_BONUS = [0, 10, 15, 25, 40, 60, 90, 0];

const W_PAWN = makePiece(WHITE, PAWN);
const B_PAWN = makePiece(BLACK, PAWN);

export function evaluate(game: ChessGame): number {
  const { board, turn, kings } = game.state;

  let mgScore = 0;
  let egScore = 0;
  let phase = 0;
  let wBishops = 0;
  let bBishops = 0;

  const wPawnFiles = new Uint8Array(8);
  const bPawnFiles = new Uint8Array(8);

  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const p = board[sq];
    if (!p) continue;

    const pt = pieceType(p);
    const color = pieceColor(p);
    const lookupSq = color === WHITE ? sq : mirrorSq(sq);
    const sign = color === WHITE ? 1 : -1;

    mgScore += sign * (MATERIAL[pt] + MG_TABLES[pt]![lookupSq]);
    egScore += sign * (MATERIAL[pt] + EG_TABLES[pt]![lookupSq]);
    phase += PHASE_WEIGHT[pt];

    if (pt === BISHOP) {
      if (color === WHITE) wBishops++;
      else bBishops++;
    }

    if (pt === PAWN) {
      const file = sqFile(sq);
      if (color === WHITE) wPawnFiles[file]++;
      else bPawnFiles[file]++;
    }
  }

  if (wBishops >= 2) { mgScore += 30; egScore += 30; }
  if (bBishops >= 2) { mgScore -= 30; egScore -= 30; }

  for (let f = 0; f < 8; f++) {
    if (wPawnFiles[f] > 1) {
      const pen = (wPawnFiles[f] - 1) * 10;
      mgScore -= pen;
      egScore -= pen;
    }
    if (bPawnFiles[f] > 1) {
      const pen = (bPawnFiles[f] - 1) * 10;
      mgScore += pen;
      egScore += pen;
    }

    if (wPawnFiles[f] > 0) {
      const neighbor = (f > 0 && wPawnFiles[f - 1] > 0) ||
                       (f < 7 && wPawnFiles[f + 1] > 0);
      if (!neighbor) {
        const pen = 15 * wPawnFiles[f];
        mgScore -= pen;
        egScore -= pen;
      }
    }
    if (bPawnFiles[f] > 0) {
      const neighbor = (f > 0 && bPawnFiles[f - 1] > 0) ||
                       (f < 7 && bPawnFiles[f + 1] > 0);
      if (!neighbor) {
        const pen = 15 * bPawnFiles[f];
        mgScore += pen;
        egScore += pen;
      }
    }
  }

  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const p = board[sq];
    if (!p || pieceType(p) !== PAWN) continue;

    const color = pieceColor(p);
    const rank = sqRank(sq);
    const file = sqFile(sq);
    let passed = true;

    if (color === WHITE) {
      for (let r = rank + 1; r <= 7 && passed; r++) {
        for (let df = -1; df <= 1; df++) {
          const f2 = file + df;
          if (f2 < 0 || f2 > 7) continue;
          const s = sq88(r, f2);
          if (board[s] && pieceType(board[s]) === PAWN && pieceColor(board[s]) === BLACK) {
            passed = false;
            break;
          }
        }
      }
      if (passed) {
        const bonus = PASSED_PAWN_BONUS[rank];
        mgScore += bonus;
        egScore += bonus * 2;
      }
    } else {
      for (let r = rank - 1; r >= 0 && passed; r--) {
        for (let df = -1; df <= 1; df++) {
          const f2 = file + df;
          if (f2 < 0 || f2 > 7) continue;
          const s = sq88(r, f2);
          if (board[s] && pieceType(board[s]) === PAWN && pieceColor(board[s]) === WHITE) {
            passed = false;
            break;
          }
        }
      }
      if (passed) {
        const bonus = PASSED_PAWN_BONUS[7 - rank];
        mgScore -= bonus;
        egScore -= bonus * 2;
      }
    }
  }

  const savedTurn = game.state.turn;

  game.state.turn = WHITE;
  const wMoves = generatePseudoLegal(game.state);
  let wMobility = 0;
  for (const m of wMoves) {
    const pt = pieceType(m.piece);
    if (pt === BISHOP || pt === ROOK || pt === QUEEN) wMobility++;
  }

  game.state.turn = BLACK;
  const bMoves = generatePseudoLegal(game.state);
  let bMobility = 0;
  for (const m of bMoves) {
    const pt = pieceType(m.piece);
    if (pt === BISHOP || pt === ROOK || pt === QUEEN) bMobility++;
  }

  game.state.turn = savedTurn;

  const mobilityDiff = (wMobility - bMobility) * 3;
  mgScore += mobilityDiff;
  egScore += mobilityDiff;

  const wKingSq = kings[WHITE];
  const wKf = sqFile(wKingSq);
  const wKr = sqRank(wKingSq);
  let wShield = 0;
  for (let f = Math.max(0, wKf - 1); f <= Math.min(7, wKf + 1); f++) {
    const s1 = sq88(wKr + 1, f);
    if (isOnBoard(s1) && board[s1] === W_PAWN) wShield += 10;
    const s2 = sq88(wKr + 2, f);
    if (isOnBoard(s2) && board[s2] === W_PAWN) wShield += 5;
  }

  const bKingSq = kings[BLACK];
  const bKf = sqFile(bKingSq);
  const bKr = sqRank(bKingSq);
  let bShield = 0;
  for (let f = Math.max(0, bKf - 1); f <= Math.min(7, bKf + 1); f++) {
    const s1 = sq88(bKr - 1, f);
    if (isOnBoard(s1) && board[s1] === B_PAWN) bShield += 10;
    const s2 = sq88(bKr - 2, f);
    if (isOnBoard(s2) && board[s2] === B_PAWN) bShield += 5;
  }

  mgScore += wShield - bShield;

  const cp = Math.min(phase, TOTAL_PHASE);
  const score = (mgScore * cp + egScore * (TOTAL_PHASE - cp)) / TOTAL_PHASE;

  return turn === WHITE ? score : -score;
}

export function evaluateMaterial(game: ChessGame): number {
  const { board, turn } = game.state;
  let score = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const p = board[sq];
    if (!p) continue;
    score += (pieceColor(p) === WHITE ? 1 : -1) * MATERIAL[pieceType(p)];
  }
  return turn === WHITE ? score : -score;
}
