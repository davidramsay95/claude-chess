import { getLegalMoves, isInCheck, makeMove } from "../engine/index";
import type { GameState, Move } from "../engine/types";
import { evaluateForColor, PIECE_VALUES } from "./evaluate";
import type { DifficultyConfig } from "./difficulty";

/** Thrown internally to unwind the search stack once the time budget is spent. */
class SearchTimeUp extends Error {}

const MATE_SCORE = 1_000_000;
const MAX_QUIESCENCE_DEPTH = 6;

export interface SearchResult {
  move: Move;
  /** Score in centipawns from the mover's own perspective (positive = good). */
  score: number;
  depthReached: number;
  nodes: number;
}

function squareToIndex(square: string): number {
  const file = square.charCodeAt(0) - "a".charCodeAt(0);
  const rank = square.charCodeAt(1) - "1".charCodeAt(0);
  return rank * 8 + file;
}

/**
 * Cheap move-ordering heuristic (no need for full MVV-LVA precision): try
 * captures of valuable pieces with cheap pieces first, since those are most
 * likely to be good and let alpha-beta prune the rest of the branch sooner.
 */
function orderMoves(state: GameState, moves: Move[]): Move[] {
  return moves
    .map((move) => {
      const target = state.board[squareToIndex(move.to)];
      const attacker = state.board[squareToIndex(move.from)];
      let score = 0;
      if (target && attacker) {
        score = 10 * PIECE_VALUES[target.type] - PIECE_VALUES[attacker.type];
      } else if (move.promotion) {
        score = PIECE_VALUES[move.promotion];
      }
      return { move, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.move);
}

function isCapture(state: GameState, move: Move): boolean {
  return state.board[squareToIndex(move.to)] !== null;
}

interface NodeCounter {
  nodes: number;
}

function checkTime(deadline: number, counter: NodeCounter): void {
  counter.nodes += 1;
  if ((counter.nodes & 511) === 0 && Date.now() > deadline) {
    throw new SearchTimeUp();
  }
}

function quiescence(
  state: GameState,
  alpha: number,
  beta: number,
  deadline: number,
  counter: NodeCounter,
  depthRemaining: number,
): number {
  checkTime(deadline, counter);

  const standPat = evaluateForColor(state, state.turn);
  if (depthRemaining <= 0) return standPat;
  if (standPat >= beta) return beta;
  let localAlpha = Math.max(alpha, standPat);

  const captures = orderMoves(
    state,
    getLegalMoves(state).filter((move) => isCapture(state, move)),
  );

  for (const move of captures) {
    const result = makeMove(state, move);
    if (!result) continue;
    const score = -quiescence(result.state, -beta, -localAlpha, deadline, counter, depthRemaining - 1);
    if (score >= beta) return beta;
    if (score > localAlpha) localAlpha = score;
  }

  return localAlpha;
}

function negamax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  deadline: number,
  counter: NodeCounter,
  useQuiescence: boolean,
): number {
  checkTime(deadline, counter);

  const legalMoves = getLegalMoves(state);
  if (legalMoves.length === 0) {
    // No moves: either checkmate (very bad for the side to move, encoded as
    // a large negative score that still prefers a *later* mate over a
    // sooner one for the opponent) or stalemate (neutral, score 0).
    return isInCheck(state, state.turn) ? -MATE_SCORE - depth : 0;
  }

  if (depth === 0) {
    return useQuiescence
      ? quiescence(state, alpha, beta, deadline, counter, MAX_QUIESCENCE_DEPTH)
      : evaluateForColor(state, state.turn);
  }

  let localAlpha = alpha;
  const ordered = orderMoves(state, legalMoves);

  for (const move of ordered) {
    const result = makeMove(state, move);
    if (!result) continue;
    const score = -negamax(result.state, depth - 1, -beta, -localAlpha, deadline, counter, useQuiescence);
    if (score >= beta) return beta;
    if (score > localAlpha) localAlpha = score;
  }

  return localAlpha;
}

function searchRoot(
  state: GameState,
  depth: number,
  config: DifficultyConfig,
  deadline: number,
  counter: NodeCounter,
): { move: Move; score: number }[] {
  const legalMoves = orderMoves(state, getLegalMoves(state));
  const scored: { move: Move; score: number }[] = [];
  let alpha = -Infinity;
  const beta = Infinity;

  for (const move of legalMoves) {
    const result = makeMove(state, move);
    if (!result) continue;
    const score = -negamax(result.state, depth - 1, -beta, -alpha, deadline, counter, config.useQuiescence);
    scored.push({ move, score });
    if (score > alpha) alpha = score;
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Runs iterative deepening up to `config.maxDepth`, stopping early if
 * `deadline` (a `Date.now()` timestamp) is reached. Always returns a legal
 * move as long as `state` has at least one (throws otherwise, matching
 * `findBestMove`'s documented behavior).
 */
export function iterativeDeepeningSearch(
  state: GameState,
  config: DifficultyConfig,
  timeLimitMs: number,
  random: () => number = Math.random,
): SearchResult {
  const legalMoves = getLegalMoves(state);
  if (legalMoves.length === 0) {
    throw new Error("No legal moves available in this position");
  }

  const deadline = Date.now() + timeLimitMs;
  const counter: NodeCounter = { nodes: 0 };

  let bestMove: Move = legalMoves[0];
  let bestScore = -Infinity;
  let depthReached = 0;

  for (let depth = 1; depth <= config.maxDepth; depth++) {
    let scored: { move: Move; score: number }[];
    try {
      scored = searchRoot(state, depth, config, deadline, counter);
    } catch (error) {
      if (error instanceof SearchTimeUp) break;
      throw error;
    }

    if (scored.length === 0) break;

    // `topMoveRandomness` means "pick randomly among the N best-scoring root
    // moves" (1 = always the single best move). This is what gives `easy`
    // and `medium` their occasional non-optimal ("blunder-ish") choices.
    const candidatePool = scored.slice(0, Math.max(1, config.topMoveRandomness));
    const chosen = candidatePool[Math.floor(random() * candidatePool.length)];

    bestMove = chosen.move;
    bestScore = chosen.score;
    depthReached = depth;

    if (Date.now() > deadline) break;
  }

  return { move: bestMove, score: bestScore, depthReached, nodes: counter.nodes };
}
