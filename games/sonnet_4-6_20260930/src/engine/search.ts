import {
  FLAG_CAPTURE, FLAG_EN_PASSANT,
  pieceType, PIECE_VALUE,
} from "./constants.js";
import { BoardState, Move, makeMove, unmakeMove, isKingInCheck } from "./board.js";
import { generateLegalMoves } from "./moveGen.js";
import { evaluate } from "./evaluate.js";

const CHECKMATE_SCORE = 100000;
const DRAW_SCORE = 0;

// ─── Move ordering ───────────────────────────────────────────────────────────

function moveScore(board: BoardState, move: Move): number {
  let score = 0;
  if (move.flags & FLAG_CAPTURE) {
    const victimType = pieceType(board.squares[move.to]);
    const attackerType = pieceType(board.squares[move.from]);
    score += 10 * PIECE_VALUE[victimType] - PIECE_VALUE[attackerType];
  }
  if (move.flags & FLAG_EN_PASSANT) score += 100;
  if (move.promotion) score += PIECE_VALUE[move.promotion] * 10;
  return score;
}

function orderMoves(board: BoardState, moves: Move[]): Move[] {
  return moves.sort((a, b) => moveScore(board, b) - moveScore(board, a));
}

// ─── Alpha-beta search (negamax) ─────────────────────────────────────────────

function alphaBeta(
  board: BoardState,
  depth: number,
  alpha: number,
  beta: number,
  positionCounts: Map<string, number>,
  stopTime: number
): number {
  if (Date.now() >= stopTime) return evaluate(board);

  const moves = generateLegalMoves(board);

  if (moves.length === 0) {
    const side = board.sideToMove;
    return isKingInCheck(board, side) ? -(CHECKMATE_SCORE + depth) : DRAW_SCORE;
  }

  // Threefold repetition check
  // (positionCounts is checked in caller; here we just detect draw by insufficient material etc.)

  if (depth === 0) return evaluate(board);

  orderMoves(board, moves);

  for (const move of moves) {
    makeMove(board, move);
    const score = -alphaBeta(board, depth - 1, -beta, -alpha, positionCounts, stopTime);
    unmakeMove(board, move);

    if (Date.now() >= stopTime) return alpha;

    if (score > alpha) {
      alpha = score;
      if (alpha >= beta) break;
    }
  }

  return alpha;
}

// ─── Quiescence search ───────────────────────────────────────────────────────

function quiescence(
  board: BoardState,
  alpha: number,
  beta: number,
  stopTime: number
): number {
  if (Date.now() >= stopTime) return evaluate(board);

  const standPat = evaluate(board);
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;

  const moves = generateLegalMoves(board);
  // Only examine captures
  const captures = moves.filter((m) => (m.flags & (FLAG_CAPTURE | FLAG_EN_PASSANT)) !== 0);
  orderMoves(board, captures);

  for (const move of captures) {
    makeMove(board, move);
    const score = -quiescence(board, -beta, -alpha, stopTime);
    unmakeMove(board, move);

    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }

  return alpha;
}

function alphaBetaQ(
  board: BoardState,
  depth: number,
  alpha: number,
  beta: number,
  stopTime: number
): number {
  if (Date.now() >= stopTime) return evaluate(board);

  const moves = generateLegalMoves(board);
  if (moves.length === 0) {
    const side = board.sideToMove;
    return isKingInCheck(board, side) ? -(CHECKMATE_SCORE + depth) : DRAW_SCORE;
  }

  if (depth === 0) return quiescence(board, alpha, beta, stopTime);

  orderMoves(board, moves);

  for (const move of moves) {
    makeMove(board, move);
    const score = -alphaBetaQ(board, depth - 1, -beta, -alpha, stopTime);
    unmakeMove(board, move);

    if (Date.now() >= stopTime) return alpha;
    if (score > alpha) {
      alpha = score;
      if (alpha >= beta) break;
    }
  }

  return alpha;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface SearchResult {
  move: Move | null;
  score: number;
}

export function findBestMove(
  board: BoardState,
  difficulty: string,
  positionCounts: Map<string, number>,
  timeLimitMs = 4500
): SearchResult {
  const moves = generateLegalMoves(board);
  if (moves.length === 0) return { move: null, score: 0 };

  // Easy: mostly shallow + random
  if (difficulty === "easy") {
    if (Math.random() < 0.4) {
      return { move: moves[Math.floor(Math.random() * moves.length)], score: 0 };
    }
    return searchAtDepth(board, moves, 1, positionCounts, Date.now() + timeLimitMs, false);
  }

  if (difficulty === "medium") {
    return searchAtDepth(board, moves, 3, positionCounts, Date.now() + timeLimitMs, false);
  }

  if (difficulty === "hard") {
    return iterativeDeepening(board, moves, 5, positionCounts, Date.now() + timeLimitMs, false);
  }

  // Expert: deeper with quiescence
  return iterativeDeepening(board, moves, 8, positionCounts, Date.now() + timeLimitMs, true);
}

function searchAtDepth(
  board: BoardState,
  moves: Move[],
  depth: number,
  positionCounts: Map<string, number>,
  stopTime: number,
  useQuiescence: boolean
): SearchResult {
  orderMoves(board, moves);

  let bestMove: Move | null = null;
  let bestScore = -Infinity;

  for (const move of moves) {
    makeMove(board, move);
    const score = useQuiescence
      ? -alphaBetaQ(board, depth - 1, -Infinity, -bestScore, stopTime)
      : -alphaBeta(board, depth - 1, -Infinity, -bestScore, positionCounts, stopTime);
    unmakeMove(board, move);

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return { move: bestMove, score: bestScore };
}

function iterativeDeepening(
  board: BoardState,
  moves: Move[],
  maxDepth: number,
  positionCounts: Map<string, number>,
  stopTime: number,
  useQuiescence: boolean
): SearchResult {
  let result: SearchResult = { move: moves[0], score: 0 };

  for (let depth = 1; depth <= maxDepth; depth++) {
    if (Date.now() >= stopTime) break;
    const r = searchAtDepth(board, moves, depth, positionCounts, stopTime, useQuiescence);
    if (r.move !== null) {
      result = r;
      // Re-order moves to put best first for next iteration
      if (r.move) {
        const idx = moves.indexOf(r.move);
        if (idx > 0) {
          moves.splice(idx, 1);
          moves.unshift(r.move);
        }
      }
    }
    if (Date.now() >= stopTime) break;
  }

  return result;
}
