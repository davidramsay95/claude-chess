import { Board } from "./board.ts";
import { evaluate, PIECE_VALUE } from "./evaluate.ts";
import { generateLegal } from "./movegen.ts";
import { EMPTY, FLAG_EN_PASSANT, Move, pieceType } from "./types.ts";
import { Difficulty } from "../game/types.ts";

const MATE = 30000;
const INF = 1_000_000;
const ABORT = Symbol("search-abort");
const MAX_QUIESCE_PLY = 16;

export interface SearchLimits {
  maxDepth: number;
  timeMs: number;
  quiescence: boolean;
  /** Half-open centipawn window within which alternatives may be chosen. */
  randomWindow: number;
  /** Probability of playing an outright random legal move (a blunder). */
  blunderChance: number;
}

export interface SearchResult {
  bestMove: Move | null;
  score: number;
  depth: number;
  nodes: number;
}

/** Tuned so each level plays visibly differently and answers well under 5s. */
export const DIFFICULTY_LIMITS: Record<Difficulty, SearchLimits> = {
  easy: { maxDepth: 2, timeMs: 400, quiescence: false, randomWindow: 90, blunderChance: 0.18 },
  medium: { maxDepth: 3, timeMs: 900, quiescence: false, randomWindow: 40, blunderChance: 0.04 },
  hard: { maxDepth: 4, timeMs: 1600, quiescence: true, randomWindow: 0, blunderChance: 0 },
  expert: { maxDepth: 6, timeMs: 3500, quiescence: true, randomWindow: 0, blunderChance: 0 },
};

interface Ctx {
  nodes: number;
  deadline: number;
  quiescence: boolean;
}

function isCapture(move: Move): boolean {
  return move.captured !== EMPTY || move.flag === FLAG_EN_PASSANT || move.promotion !== 0;
}

function orderScore(move: Move): number {
  let score = 0;
  if (move.captured !== EMPTY) {
    score += PIECE_VALUE[pieceType(move.captured)] * 16 - PIECE_VALUE[pieceType(move.piece)];
  }
  if (move.promotion) score += PIECE_VALUE[move.promotion];
  if (move.flag === FLAG_EN_PASSANT) score += PIECE_VALUE[1];
  return score;
}

function order(moves: Move[]): Move[] {
  return moves.sort((a, b) => orderScore(b) - orderScore(a));
}

function checkTime(ctx: Ctx): void {
  if ((ctx.nodes & 2047) === 0 && performance.now() >= ctx.deadline) {
    throw ABORT;
  }
}

function quiesce(board: Board, alpha: number, beta: number, ply: number, ctx: Ctx): number {
  ctx.nodes++;
  checkTime(ctx);

  const stand = evaluate(board);
  if (ply >= MAX_QUIESCE_PLY) return stand;
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;

  const captures = order(generateLegal(board).filter(isCapture));
  for (const move of captures) {
    board.make(move);
    const score = -quiesce(board, -beta, -alpha, ply + 1, ctx);
    board.unmake(move);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(
  board: Board,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  ctx: Ctx,
): number {
  ctx.nodes++;
  checkTime(ctx);

  const moves = generateLegal(board);
  if (moves.length === 0) {
    return board.inCheck() ? -MATE + ply : 0; // checkmate or stalemate
  }
  if (depth === 0) {
    return ctx.quiescence ? quiesce(board, alpha, beta, ply, ctx) : evaluate(board);
  }

  order(moves);
  let best = -INF;
  for (const move of moves) {
    board.make(move);
    const score = -negamax(board, depth - 1, -beta, -alpha, ply + 1, ctx);
    board.unmake(move);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * Choose a move for the side to move under the given limits. Uses iterative
 * deepening; each root move is searched with a full window so alternatives
 * carry exact scores that difficulty randomness can select among.
 */
export function chooseMove(
  board: Board,
  limits: SearchLimits,
  rng: () => number = Math.random,
): SearchResult {
  const rootMoves = order(generateLegal(board));
  if (rootMoves.length === 0) {
    return { bestMove: null, score: 0, depth: 0, nodes: 0 };
  }

  const ctx: Ctx = {
    nodes: 0,
    deadline: performance.now() + limits.timeMs,
    quiescence: limits.quiescence,
  };

  let scored = rootMoves.map((move) => ({ move, score: -INF }));
  let completedDepth = 0;

  for (let depth = 1; depth <= limits.maxDepth; depth++) {
    try {
      const results = rootMoves.map((move) => {
        board.make(move);
        const score = -negamax(board, depth - 1, -INF, INF, 1, ctx);
        board.unmake(move);
        return { move, score };
      });
      results.sort((a, b) => b.score - a.score);
      scored = results;
      completedDepth = depth;
      if (Math.abs(scored[0].score) >= MATE - 100) break; // forced mate found
    } catch (err) {
      if (err === ABORT) break;
      throw err;
    }
    if (performance.now() >= ctx.deadline) break;
  }

  const chosen = selectMove(scored, limits, rng);
  return { bestMove: chosen.move, score: chosen.score, depth: completedDepth, nodes: ctx.nodes };
}

function selectMove(
  scored: Array<{ move: Move; score: number }>,
  limits: SearchLimits,
  rng: () => number,
): { move: Move; score: number } {
  if (limits.blunderChance > 0 && rng() < limits.blunderChance) {
    return scored[Math.floor(rng() * scored.length)];
  }
  const bestScore = scored[0].score;
  const candidates = scored.filter((s) => s.score >= bestScore - limits.randomWindow);
  return candidates[Math.floor(rng() * candidates.length)];
}
