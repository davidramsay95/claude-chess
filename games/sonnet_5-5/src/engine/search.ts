import { evaluate } from './evaluate';
import { filterLegal, generatePseudoLegalMoves } from './movegen';
import type { Position } from './position';
import {
  type Color,
  KING,
  type Move,
  PAWN,
  isCapture,
  isEnPassant,
  moveFrom,
  movePromotion,
  moveTo,
  pieceKind,
} from './types';

export const MATE_SCORE = 30000;
/** Scores at or beyond this magnitude encode a forced mate. */
export const MATE_BOUND = MATE_SCORE - 256;
const INFINITY = 32000;
const MAX_PLY = 96;
const MAX_MOVES = 320;
/** Plies of check evasions explored inside quiescence before falling back to the static score. */
const QUIESCENCE_CHECK_PLIES = 4;

const TT_BITS = 20;
const TT_MASK = (1 << TT_BITS) - 1;
const TT_EXACT = 1;
const TT_LOWER = 2;
const TT_UPPER = 3;

/** Trade values used only for ordering and pruning, indexed by piece kind. */
const ORDER_VALUE = [0, 100, 320, 330, 500, 950, 20000];
const QUEEN_PROMOTION_BONUS = 900;

const SCORE_TT_MOVE = 2_000_000;
const SCORE_GOOD_CAPTURE = 1_000_000;
const SCORE_QUEEN_PROMOTION = 900_000;
const SCORE_KILLER_FIRST = 800_000;
const SCORE_KILLER_SECOND = 700_000;
const HISTORY_CAP = 600_000;
const SCORE_BAD_CAPTURE = -1_000_000;

export interface SearchOptions {
  /** Deepest iteration to run. */
  maxDepth?: number;
  /** Wall-clock budget in milliseconds. */
  timeMs?: number;
  nodeLimit?: number;
  /** Max random swing added to each root move score (weak levels). */
  noiseCp?: number;
  /** Probability of deliberately choosing a non-best move among the top few (weak levels). */
  blunderChance?: number;
  /** A deliberate non-best move must score within this many centipawns of the best. */
  blunderMarginCp?: number;
  blunderTopN?: number;
  /** Moves scoring within this many centipawns of the best are treated as interchangeable. */
  varietyCp?: number;
  /** Score every root move with a full window at `maxDepth` instead of iterative deepening. */
  fullRootScan?: boolean;
  rng?: () => number;
}

export interface SearchResult {
  /** Undefined only when the side to move has no legal move. */
  move: Move | undefined;
  /** Centipawns from the side to move's perspective; mates are `MATE_SCORE - plies`. */
  scoreCp: number;
  depth: number;
  nodes: number;
  elapsedMs: number;
}

interface ScoredMove {
  move: Move;
  score: number;
}

/** Shared across searches so later moves of a game benefit from earlier work. */
class TranspositionTable {
  readonly keys = new Int32Array(1 << TT_BITS);
  readonly moves = new Int32Array(1 << TT_BITS);
  readonly scores = new Int16Array(1 << TT_BITS);
  readonly depths = new Int8Array(1 << TT_BITS);
  readonly flags = new Uint8Array(1 << TT_BITS);

  clear(): void {
    this.flags.fill(0);
  }
}

let sharedTable: TranspositionTable | undefined;
const getTable = (): TranspositionTable => (sharedTable ??= new TranspositionTable());

/** Forget everything learned about earlier positions, e.g. when a new game starts. */
export const clearTranspositionTable = (): void => {
  sharedTable?.clear();
};

const now = (): number => performance.now();

/** One search run: owns the per-search heuristics and the stop conditions. */
class Searcher {
  private readonly table = getTable();
  private readonly killers = new Int32Array(MAX_PLY * 2);
  private readonly history = new Int32Array(2 * 64 * 64);
  private readonly scoreStack: Int32Array[] = Array.from({ length: MAX_PLY + 2 }, () => new Int32Array(MAX_MOVES));
  private readonly startTime = now();
  private readonly deadline: number;
  private readonly hardDeadline: number;
  private readonly nodeLimit: number;
  private stopped = false;
  private depthOneDone = false;
  nodes = 0;

  constructor(private readonly pos: Position, timeMs: number, nodeLimit: number) {
    this.deadline = this.startTime + timeMs;
    // Depth 1 must finish so a legal move always exists; this cap only guards pathological positions.
    this.hardDeadline = this.startTime + Math.max(timeMs * 4, 250);
    this.nodeLimit = nodeLimit;
  }

  elapsed(): number {
    return now() - this.startTime;
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  private checkTime(): void {
    const time = now();
    if (this.nodes >= this.nodeLimit || (this.depthOneDone ? time > this.deadline : time > this.hardDeadline)) {
      this.stopped = true;
    }
  }

  markDepthOneDone(): void {
    this.depthOneDone = true;
  }

  private moveScore(move: Move, ttMove: Move, ply: number): number {
    if (move === ttMove) return SCORE_TT_MOVE;
    const pos = this.pos;
    const board = pos.board;
    const from = moveFrom(move);
    const to = moveTo(move);
    const promotion = movePromotion(move);
    if (isCapture(move)) {
      const victim = isEnPassant(move) ? PAWN : pieceKind(board[to]);
      const attacker = pieceKind(board[from]);
      const ordering = ORDER_VALUE[victim] * 16 - attacker + (promotion ? QUEEN_PROMOTION_BONUS : 0);
      const losing = ORDER_VALUE[victim] < ORDER_VALUE[attacker] && pos.isAttacked(to, (pos.turn ^ 1) as Color);
      return losing ? SCORE_BAD_CAPTURE + ordering : SCORE_GOOD_CAPTURE + ordering;
    }
    if (promotion) return promotion === 5 ? SCORE_QUEEN_PROMOTION : SCORE_BAD_CAPTURE;
    if (move === this.killers[ply * 2]) return SCORE_KILLER_FIRST;
    if (move === this.killers[ply * 2 + 1]) return SCORE_KILLER_SECOND;
    return this.history[(pos.turn * 64 + from) * 64 + to];
  }

  /** Scores `moves` into the ply's buffer so `pickNext` can selection-sort lazily. */
  private scoreMoves(moves: Move[], ttMove: Move, ply: number): Int32Array {
    const scores = this.scoreStack[ply];
    for (let i = 0; i < moves.length; i++) scores[i] = this.moveScore(moves[i], ttMove, ply);
    return scores;
  }

  private static pickNext(moves: Move[], scores: Int32Array, start: number): void {
    let best = start;
    for (let i = start + 1; i < moves.length; i++) {
      if (scores[i] > scores[best]) best = i;
    }
    if (best !== start) {
      const move = moves[start];
      moves[start] = moves[best];
      moves[best] = move;
      const score = scores[start];
      scores[start] = scores[best];
      scores[best] = score;
    }
  }

  private probe(ply: number, depth: number, alpha: number, beta: number, usable: boolean): { move: Move; score: number | undefined } {
    const pos = this.pos;
    const table = this.table;
    const index = pos.hashLo & TT_MASK;
    if (table.flags[index] === 0 || table.keys[index] !== pos.hashHi) return { move: 0, score: undefined };
    const move = table.moves[index];
    if (!usable || table.depths[index] < depth) return { move, score: undefined };
    let score = table.scores[index];
    if (score >= MATE_BOUND) score -= ply;
    else if (score <= -MATE_BOUND) score += ply;
    const flag = table.flags[index];
    if (flag === TT_EXACT || (flag === TT_LOWER && score >= beta) || (flag === TT_UPPER && score <= alpha)) {
      return { move, score };
    }
    return { move, score: undefined };
  }

  private store(ply: number, depth: number, score: number, flag: number, move: Move): void {
    const pos = this.pos;
    const table = this.table;
    const index = pos.hashLo & TT_MASK;
    let stored = score;
    if (stored >= MATE_BOUND) stored += ply;
    else if (stored <= -MATE_BOUND) stored -= ply;
    table.keys[index] = pos.hashHi;
    table.moves[index] = move;
    table.scores[index] = stored;
    table.depths[index] = depth;
    table.flags[index] = flag;
  }

  private rewardQuiet(move: Move, depth: number, ply: number): void {
    const killers = this.killers;
    if (killers[ply * 2] !== move) {
      killers[ply * 2 + 1] = killers[ply * 2];
      killers[ply * 2] = move;
    }
    const index = (this.pos.turn * 64 + moveFrom(move)) * 64 + moveTo(move);
    const updated = this.history[index] + depth * depth;
    this.history[index] = updated > HISTORY_CAP ? HISTORY_CAP : updated;
  }

  private quiesce(alpha: number, beta: number, ply: number, qply: number): number {
    if ((++this.nodes & 2047) === 0) this.checkTime();
    if (this.stopped) return 0;
    const pos = this.pos;
    if (ply >= MAX_PLY) return evaluate(pos);

    const inCheck = pos.inCheck();
    const evading = inCheck && qply < QUIESCENCE_CHECK_PLIES;
    let best: number;
    if (evading) {
      best = -MATE_SCORE + ply;
    } else {
      best = evaluate(pos);
      if (best >= beta) return best;
      if (best > alpha) alpha = best;
    }
    const standPat = best;

    const moves = generatePseudoLegalMoves(pos, !evading);
    const scores = this.scoreMoves(moves, 0, ply);
    const us = pos.turn;
    for (let i = 0; i < moves.length; i++) {
      Searcher.pickNext(moves, scores, i);
      const move = moves[i];
      if (!evading) {
        // Bad captures sort below zero; nothing after them is worth searching in quiescence.
        if (scores[i] < 0) break;
        const promotion = movePromotion(move);
        const victim = isEnPassant(move) ? PAWN : pieceKind(pos.board[moveTo(move)]);
        // Delta pruning: even winning the victim outright cannot lift the score to alpha.
        if (!promotion && standPat + ORDER_VALUE[victim] + 200 <= alpha) continue;
      }
      pos.makeMove(move);
      if (pos.inCheck(us)) {
        pos.unmakeMove();
        continue;
      }
      const score = -this.quiesce(-beta, -alpha, ply + 1, qply + 1);
      pos.unmakeMove();
      if (this.stopped) return 0;
      if (evading && best === -MATE_SCORE + ply) best = score;
      if (score > best) best = score;
      if (score > alpha) {
        alpha = score;
        if (score >= beta) break;
      }
    }
    return best;
  }

  negamax(depth: number, alpha: number, beta: number, ply: number, allowNull: boolean): number {
    if ((++this.nodes & 2047) === 0) this.checkTime();
    if (this.stopped) return 0;
    const pos = this.pos;

    if (pos.halfmoveClock >= 100 || pos.repetitionCount() >= 2) return 0;
    if (alpha < -MATE_SCORE + ply) alpha = -MATE_SCORE + ply;
    if (beta > MATE_SCORE - ply - 1) beta = MATE_SCORE - ply - 1;
    if (alpha >= beta) return alpha;

    const inCheck = pos.inCheck();
    if (inCheck) depth++;
    if (ply >= MAX_PLY) return evaluate(pos);
    if (depth <= 0) return this.quiesce(alpha, beta, ply, 0);

    const isPv = beta - alpha > 1;
    const probe = this.probe(ply, depth, alpha, beta, !isPv);
    if (probe.score !== undefined) return probe.score;
    const ttMove = probe.move;

    const us = pos.turn;
    const staticEval = inCheck ? -INFINITY : evaluate(pos);

    if (!isPv && !inCheck && Math.abs(beta) < MATE_BOUND) {
      // Reverse futility: far above beta at shallow depth, so the search would only confirm it.
      if (depth <= 3 && staticEval - 110 * depth >= beta) return staticEval;
      if (allowNull && depth >= 3 && staticEval >= beta && pos.hasNonPawnMaterial(us)) {
        const reduction = 2 + (depth >= 6 ? 1 : 0);
        pos.makeNullMove();
        const score = -this.negamax(depth - 1 - reduction, -beta, -beta + 1, ply + 1, false);
        pos.unmakeNullMove();
        if (this.stopped) return 0;
        if (score >= beta) return score >= MATE_BOUND ? beta : score;
      }
    }

    const moves = generatePseudoLegalMoves(pos);
    const scores = this.scoreMoves(moves, ttMove, ply);
    const originalAlpha = alpha;
    let best = -INFINITY;
    let bestMove: Move = 0;
    let legalCount = 0;

    for (let i = 0; i < moves.length; i++) {
      Searcher.pickNext(moves, scores, i);
      const move = moves[i];
      const quiet = !isCapture(move) && movePromotion(move) === 0;

      if (quiet && legalCount > 0 && !inCheck && !isPv && depth <= 2 && staticEval + 130 * depth <= alpha) {
        continue;
      }

      pos.makeMove(move);
      if (pos.inCheck(us)) {
        pos.unmakeMove();
        continue;
      }
      legalCount++;
      const givesCheck = pos.inCheck();
      const newDepth = depth - 1;

      let score: number;
      if (legalCount === 1) {
        score = -this.negamax(newDepth, -beta, -alpha, ply + 1, true);
      } else {
        let reduction = 0;
        if (depth >= 3 && legalCount > 3 && quiet && !inCheck && !givesCheck) {
          reduction = 1 + (legalCount > 8 ? 1 : 0) + (depth >= 7 ? 1 : 0) - (isPv ? 1 : 0);
          if (reduction > newDepth - 1) reduction = newDepth - 1;
          if (reduction < 0) reduction = 0;
        }
        score = -this.negamax(newDepth - reduction, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && reduction > 0) score = -this.negamax(newDepth, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && score < beta) score = -this.negamax(newDepth, -beta, -alpha, ply + 1, true);
      }
      pos.unmakeMove();
      if (this.stopped) return 0;

      if (score > best) {
        best = score;
        bestMove = move;
        if (score > alpha) {
          alpha = score;
          if (score >= beta) {
            if (quiet) this.rewardQuiet(move, depth, ply);
            break;
          }
        }
      }
    }

    if (legalCount === 0) return inCheck ? -MATE_SCORE + ply : 0;
    const flag = best <= originalAlpha ? TT_UPPER : best >= beta ? TT_LOWER : TT_EXACT;
    this.store(ply, depth, best, flag, bestMove);
    return best;
  }

  /** Searches the root moves in the given order; returns the best score and reorders `rootMoves`. */
  searchRoot(rootMoves: Move[], depth: number, alpha: number, beta: number): { score: number; move: Move } {
    const pos = this.pos;
    const us = pos.turn;
    let best = -INFINITY;
    let bestMove: Move = 0;
    for (let i = 0; i < rootMoves.length; i++) {
      const move = rootMoves[i];
      const quiet = !isCapture(move) && movePromotion(move) === 0;
      pos.makeMove(move);
      const givesCheck = pos.inCheck();
      const newDepth = depth - 1;
      let score: number;
      if (i === 0) {
        score = -this.negamax(newDepth, -beta, -alpha, 1, true);
      } else {
        let reduction = 0;
        if (depth >= 3 && i > 3 && quiet && !givesCheck) {
          reduction = 1 + (i > 8 ? 1 : 0);
          if (reduction > newDepth - 1) reduction = newDepth - 1;
          if (reduction < 0) reduction = 0;
        }
        score = -this.negamax(newDepth - reduction, -alpha - 1, -alpha, 1, true);
        if (score > alpha && reduction > 0) score = -this.negamax(newDepth, -alpha - 1, -alpha, 1, true);
        if (score > alpha && score < beta) score = -this.negamax(newDepth, -beta, -alpha, 1, true);
      }
      pos.unmakeMove();
      if (this.stopped) break;
      if (score > best) {
        best = score;
        bestMove = move;
        if (score > alpha) {
          alpha = score;
          if (score >= beta) break;
        }
      }
    }
    if (bestMove !== 0) {
      const at = rootMoves.indexOf(bestMove);
      rootMoves.splice(at, 1);
      rootMoves.unshift(bestMove);
    }
    return { score: best, move: bestMove };
  }

  /** Exact score of `move` at `depth`, searching only enough to tell whether it beats `threshold`. */
  scoreAgainst(move: Move, depth: number, threshold: number): number {
    const pos = this.pos;
    pos.makeMove(move);
    const score = -this.negamax(depth - 1, -threshold, -threshold + 1, 1, true);
    pos.unmakeMove();
    return score;
  }

  /** Full-window score of every root move, used by the weak levels that pick imperfectly. */
  scanRoot(rootMoves: Move[], depth: number): ScoredMove[] {
    const pos = this.pos;
    const scored: ScoredMove[] = [];
    for (const move of rootMoves) {
      pos.makeMove(move);
      const score = -this.negamax(depth - 1, -INFINITY, INFINITY, 1, true);
      pos.unmakeMove();
      if (this.stopped) break;
      scored.push({ move, score });
    }
    return scored;
  }
}

/** Orders root moves by static priority so the first iteration starts sensibly. */
const orderRootMoves = (pos: Position, moves: Move[]): void => {
  const priority = (move: Move): number => {
    const victim = isCapture(move) ? (isEnPassant(move) ? PAWN : pieceKind(pos.board[moveTo(move)])) : 0;
    const attacker = pieceKind(pos.board[moveFrom(move)]);
    return (victim ? ORDER_VALUE[victim] * 16 - attacker : 0) + (movePromotion(move) ? 5000 : 0);
  };
  moves.sort((a, b) => priority(b) - priority(a));
};

const noisy = (score: number, noiseCp: number, rng: () => number): number => {
  if (score >= MATE_BOUND) return 100_000 + score;
  if (score <= -MATE_BOUND) return -100_000 + score;
  return score + (rng() + rng() - 1) * noiseCp;
};

/**
 * Picks among fully scored root moves with noise and occasional deliberate second-best choices.
 * Forced wins are never thrown away and forced losses are never chosen on purpose.
 */
const pickImperfectMove = (scored: ScoredMove[], options: SearchOptions, rng: () => number): ScoredMove => {
  const noiseCp = options.noiseCp ?? 0;
  const ranked = scored
    .map((entry) => ({ entry, value: noisy(entry.score, noiseCp, rng) }))
    .sort((a, b) => b.value - a.value);
  const top = ranked[0];
  if (top.entry.score >= MATE_BOUND) return top.entry;

  const chance = options.blunderChance ?? 0;
  if (chance > 0 && rng() < chance) {
    const margin = options.blunderMarginCp ?? 200;
    const pool = ranked
      .slice(1, options.blunderTopN ?? 3)
      .filter((candidate) => candidate.entry.score > -MATE_BOUND && candidate.value >= top.value - margin);
    if (pool.length > 0) return pool[Math.floor(rng() * pool.length)].entry;
  }
  return top.entry;
};

const finish = (searcher: Searcher, move: Move | undefined, scoreCp: number, depth: number): SearchResult => ({
  move,
  scoreCp,
  depth,
  nodes: searcher.nodes,
  elapsedMs: searcher.elapsed(),
});

/**
 * Finds a move for the side to move. The position is restored before returning.
 * Iterative deepening with PVS, aspiration windows, TT, null move, LMR and quiescence;
 * weak levels layer noise and deliberate mistakes on top via `options`.
 */
export const searchBestMove = (position: Position, options: SearchOptions = {}): SearchResult => {
  const timeMs = options.timeMs ?? 1000;
  const maxDepth = Math.min(options.maxDepth ?? 64, MAX_PLY - 8);
  const rng = options.rng ?? Math.random;
  const searcher = new Searcher(position, timeMs, options.nodeLimit ?? Number.MAX_SAFE_INTEGER);

  const rootMoves = filterLegal(position, generatePseudoLegalMoves(position));
  if (rootMoves.length === 0) {
    return finish(searcher, undefined, position.inCheck() ? -MATE_SCORE : 0, 0);
  }
  if (rootMoves.length === 1) {
    return finish(searcher, rootMoves[0], evaluate(position), 0);
  }
  orderRootMoves(position, rootMoves);

  if (options.fullRootScan) {
    // Run the shallower iterations first so the table and killers make the full scan cheaper.
    let completed = 0;
    for (let depth = 1; depth < maxDepth; depth++) {
      const result = searcher.searchRoot(rootMoves, depth, -INFINITY, INFINITY);
      if (searcher.isStopped || result.move === 0) break;
      searcher.markDepthOneDone();
      completed = depth;
    }
    const scored = searcher.scanRoot(rootMoves, maxDepth);
    if (scored.length === 0) return finish(searcher, rootMoves[0], 0, completed);
    searcher.markDepthOneDone();
    const picked = pickImperfectMove(scored, options, rng);
    return finish(searcher, picked.move, picked.score, maxDepth);
  }

  let bestMove = rootMoves[0];
  let bestScore = 0;
  let completed = 0;

  for (let depth = 1; depth <= maxDepth; depth++) {
    let alpha = -INFINITY;
    let beta = INFINITY;
    let window = 25;
    if (depth >= 4) {
      alpha = Math.max(-INFINITY, bestScore - window);
      beta = Math.min(INFINITY, bestScore + window);
    }

    let result = searcher.searchRoot(rootMoves, depth, alpha, beta);
    while (!searcher.isStopped && (result.score <= alpha || result.score >= beta)) {
      window *= 3;
      if (window > 500) {
        alpha = -INFINITY;
        beta = INFINITY;
      } else if (result.score <= alpha) {
        alpha = Math.max(-INFINITY, result.score - window);
      } else {
        beta = Math.min(INFINITY, result.score + window);
      }
      result = searcher.searchRoot(rootMoves, depth, alpha, beta);
    }

    // A partial iteration is still valid when it found a move that beat the previous best.
    if (result.move !== 0 && (!searcher.isStopped || result.score > alpha)) {
      bestMove = result.move;
      bestScore = result.score;
      if (!searcher.isStopped) completed = depth;
    }
    if (searcher.isStopped) break;
    searcher.markDepthOneDone();
    if (Math.abs(bestScore) >= MATE_BOUND) break;
    if (searcher.elapsed() > timeMs * 0.45) break;
  }

  const variety = options.varietyCp ?? 0;
  if (variety > 0 && !searcher.isStopped && completed >= 3 && Math.abs(bestScore) < MATE_BOUND) {
    const threshold = bestScore - variety;
    const equals: Move[] = [bestMove];
    for (const move of rootMoves.slice(1, 5)) {
      if (move === bestMove) continue;
      const score = searcher.scoreAgainst(move, completed - 1, threshold);
      if (searcher.isStopped) break;
      if (score >= threshold) equals.push(move);
    }
    if (!searcher.isStopped && equals.length > 1) {
      bestMove = equals[Math.floor(rng() * equals.length)];
    }
  }

  return finish(searcher, bestMove, bestScore, completed);
};
