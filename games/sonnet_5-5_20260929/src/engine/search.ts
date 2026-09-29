import { evaluate, hasNonPawnMaterial, PIECE_VALUE } from "./evaluate";
import {
  FLAG_CAPTURE,
  FLAG_DOUBLE_PUSH,
  FLAG_EN_PASSANT,
  FLAG_NONE,
  Position,
  moveFlag,
  moveFrom,
  movePromotion,
  moveTo,
  moveToUci,
  pieceType,
} from "./position";
import type { Difficulty } from "../state";

export { evaluate };

const MATE = 30000;
const MATE_BOUND = MATE - 200;
const INFINITY = 32000;
const MAX_PLY = 64;
const TT_BITS = 19;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;

const BOUND_EXACT = 0;
const BOUND_LOWER = 1;
const BOUND_UPPER = 2;

/** How an engine level thinks. Depth, time and noise are the three dials that separate the levels. */
export interface LevelSettings {
  maxDepth: number;
  /** Hard time limit in milliseconds. */
  timeMs: number;
  /** Search captures to the end of the line at the horizon. */
  quiescence: boolean;
  /** Random score jitter in centipawns added to each root move; forces a per-move full search. */
  noise: number;
  /** Chance of ignoring the search and playing a random legal move. */
  randomMoveChance: number;
}

export const LEVELS: Record<Difficulty, LevelSettings> = {
  easy: { maxDepth: 1, timeMs: 300, quiescence: false, noise: 140, randomMoveChance: 0.12 },
  medium: { maxDepth: 3, timeMs: 800, quiescence: true, noise: 35, randomMoveChance: 0 },
  hard: { maxDepth: 8, timeMs: 1200, quiescence: true, noise: 0, randomMoveChance: 0 },
  expert: { maxDepth: 40, timeMs: 3500, quiescence: true, noise: 0, randomMoveChance: 0 },
};

/** Hard and expert vary their first replies slightly so every game does not start the same way. */
const OPENING_VARIETY: LevelSettings = { maxDepth: 4, timeMs: 400, quiescence: true, noise: 18, randomMoveChance: 0 };
const OPENING_PLIES = 6;

export interface SearchOutcome {
  move: string | null;
  depth: number;
  score: number;
  nodes: number;
}

const ttHigh = new Int32Array(TT_SIZE);
const ttLow = new Int32Array(TT_SIZE);
const ttMove = new Int32Array(TT_SIZE);
const ttScore = new Int32Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttBound = new Uint8Array(TT_SIZE);

class Searcher {
  private readonly position: Position;
  private readonly settings: LevelSettings;
  private readonly moves = new Int32Array(MAX_PLY * 2 * 256);
  private readonly order = new Int32Array(MAX_PLY * 2 * 256);
  private readonly killers = new Int32Array(MAX_PLY * 2 + 4);
  private readonly history = new Int32Array(2 * 128 * 128);
  private deadline = 0;
  private stopped = false;
  nodes = 0;

  constructor(position: Position, settings: LevelSettings) {
    this.position = position;
    this.settings = settings;
  }

  private outOfTime(): boolean {
    if ((this.nodes & 2047) === 0 && performance.now() > this.deadline) this.stopped = true;
    return this.stopped;
  }

  private scoreMoves(base: number, count: number, ttBest: number, ply: number): void {
    const board = this.position.board;
    const side = this.position.side;
    for (let i = base; i < base + count; i++) {
      const move = this.moves[i];
      const flag = moveFlag(move);
      let score: number;
      if (move === ttBest) {
        score = 2_000_000;
      } else if (flag === FLAG_CAPTURE || flag === FLAG_EN_PASSANT) {
        const victim = flag === FLAG_EN_PASSANT ? 1 : pieceType(board[moveTo(move)]);
        score = 1_000_000 + victim * 16 - pieceType(board[moveFrom(move)]) + (movePromotion(move) === 5 ? 500 : 0);
      } else if (movePromotion(move) === 5) {
        score = 990_000;
      } else if (move === this.killers[ply * 2]) {
        score = 900_000;
      } else if (move === this.killers[ply * 2 + 1]) {
        score = 800_000;
      } else {
        score = this.history[(side << 14) | (moveFrom(move) << 7) | moveTo(move)];
      }
      this.order[i] = score;
    }
  }

  /** Swaps the best-scored remaining move into slot `index` (selection sort, cheap for early cutoffs). */
  private pickNext(index: number, end: number): number {
    let best = index;
    for (let i = index + 1; i < end; i++) if (this.order[i] > this.order[best]) best = i;
    if (best !== index) {
      const move = this.moves[index];
      this.moves[index] = this.moves[best];
      this.moves[best] = move;
      const score = this.order[index];
      this.order[index] = this.order[best];
      this.order[best] = score;
    }
    return this.moves[index];
  }

  private quiesce(alpha: number, beta: number, ply: number): number {
    this.nodes++;
    if (this.outOfTime()) return 0;
    const position = this.position;
    const standPat = evaluate(position);
    if (ply >= MAX_PLY - 1 || standPat >= beta) return standPat;
    if (standPat > alpha) alpha = standPat;

    const base = ply * 256;
    const count = position.generatePseudo(this.moves, base, true) - base;
    this.scoreMoves(base, count, 0, ply);
    const us = position.side;
    let best = standPat;
    for (let i = 0; i < count; i++) {
      const move = this.pickNext(base + i, base + count);
      const gain = moveFlag(move) === FLAG_EN_PASSANT ? 100 : PIECE_VALUE[pieceType(position.board[moveTo(move)])];
      if (standPat + gain + 200 < alpha && movePromotion(move) === 0) continue;
      position.makeMove(move);
      if (position.isAttacked(position.kingSquare[us], us ^ 1)) {
        position.unmakeMove();
        continue;
      }
      const score = -this.quiesce(-beta, -alpha, ply + 1);
      position.unmakeMove();
      if (this.stopped) return 0;
      if (score > best) {
        best = score;
        if (score > alpha) {
          alpha = score;
          if (alpha >= beta) break;
        }
      }
    }
    return best;
  }

  private negamax(depth: number, alpha: number, beta: number, ply: number, allowNull: boolean): number {
    this.nodes++;
    if (this.outOfTime()) return 0;
    const position = this.position;

    if (ply > 0) {
      if (position.halfmove >= 100 || position.repetitionCount() >= 2) return 0;
      alpha = Math.max(alpha, -MATE + ply);
      beta = Math.min(beta, MATE - ply - 1);
      if (alpha >= beta) return alpha;
    }

    const inCheck = position.inCheck();
    if (inCheck) depth++;
    if (depth <= 0) return this.settings.quiescence ? this.quiesce(alpha, beta, ply) : evaluate(position);
    if (ply >= MAX_PLY - 1) return evaluate(position);

    const isPrincipal = beta - alpha > 1;
    const slot = position.hashLo & TT_MASK;
    let ttBest = 0;
    if (ttHigh[slot] === position.hashHi && ttLow[slot] === position.hashLo && ttBound[slot] !== 3) {
      ttBest = ttMove[slot];
      if (ttDepth[slot] >= depth && !isPrincipal) {
        let stored = ttScore[slot];
        if (stored > MATE_BOUND) stored -= ply;
        else if (stored < -MATE_BOUND) stored += ply;
        const bound = ttBound[slot];
        if (bound === BOUND_EXACT) return stored;
        if (bound === BOUND_LOWER && stored >= beta) return stored;
        if (bound === BOUND_UPPER && stored <= alpha) return stored;
      }
    }

    const us = position.side;
    const staticScore = inCheck ? -INFINITY : evaluate(position);

    if (!isPrincipal && !inCheck && depth <= 3 && staticScore - 120 * depth >= beta && beta > -MATE_BOUND) {
      return staticScore;
    }

    if (!isPrincipal && allowNull && !inCheck && depth >= 3 && staticScore >= beta && hasNonPawnMaterial(position, us)) {
      const reduction = depth >= 6 ? 3 : 2;
      position.makeNullMove();
      const score = -this.negamax(depth - 1 - reduction, -beta, -beta + 1, ply + 1, false);
      position.unmakeNullMove();
      if (this.stopped) return 0;
      if (score >= beta) return score >= MATE_BOUND ? beta : score;
    }

    const base = ply * 256;
    const count = position.generatePseudo(this.moves, base, false) - base;
    this.scoreMoves(base, count, ttBest, ply);

    let best = -INFINITY;
    let bestMove = 0;
    let legal = 0;
    let bound = BOUND_UPPER;

    for (let i = 0; i < count; i++) {
      const move = this.pickNext(base + i, base + count);
      position.makeMove(move);
      if (position.isAttacked(position.kingSquare[us], us ^ 1)) {
        position.unmakeMove();
        continue;
      }
      legal++;
      const flag = moveFlag(move);
      const quiet = (flag === FLAG_NONE || flag === FLAG_DOUBLE_PUSH) && movePromotion(move) === 0;

      let score: number;
      if (legal === 1) {
        score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
      } else {
        let reduction = 0;
        if (depth >= 3 && legal >= 4 && quiet && !inCheck && !position.inCheck()) {
          reduction = legal >= 9 ? 2 : 1;
        }
        score = -this.negamax(depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && reduction > 0) score = -this.negamax(depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && score < beta) score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
      }
      position.unmakeMove();
      if (this.stopped) return 0;

      if (score > best) {
        best = score;
        bestMove = move;
        if (score > alpha) {
          alpha = score;
          bound = BOUND_EXACT;
          if (alpha >= beta) {
            bound = BOUND_LOWER;
            if (quiet) {
              if (this.killers[ply * 2] !== move) {
                this.killers[ply * 2 + 1] = this.killers[ply * 2];
                this.killers[ply * 2] = move;
              }
              const index = (us << 14) | (moveFrom(move) << 7) | moveTo(move);
              this.history[index] = Math.min(this.history[index] + depth * depth, 800_000);
            }
            break;
          }
        }
      }
    }

    if (legal === 0) return inCheck ? -MATE + ply : 0;

    let stored = best;
    if (stored > MATE_BOUND) stored += ply;
    else if (stored < -MATE_BOUND) stored -= ply;
    // Deeper results survive; an entry for a different position is replaced only by one at least as deep.
    if (ttBound[slot] === 3 || ttDepth[slot] <= depth) {
      ttHigh[slot] = position.hashHi;
      ttLow[slot] = position.hashLo;
      ttMove[slot] = bestMove;
      ttScore[slot] = stored;
      ttDepth[slot] = depth;
      ttBound[slot] = bound;
    }
    return best;
  }

  private hasLegalMove(): boolean {
    const position = this.position;
    const us = position.side;
    const base = MAX_PLY * 256;
    const end = position.generatePseudo(this.moves, base, false);
    for (let i = base; i < end; i++) {
      position.makeMove(this.moves[i]);
      const legal = !position.isAttacked(position.kingSquare[us], us ^ 1);
      position.unmakeMove();
      if (legal) return true;
    }
    return false;
  }

  /** Scores every root move on its own with a full window, then adds jitter. Used by the weaker levels. */
  private noisyRoot(rootMoves: number[], depth: number): { move: number; score: number } {
    const position = this.position;
    let bestMove = rootMoves[0];
    let bestScore = -Infinity;
    let bestRaw = 0;
    for (const move of rootMoves) {
      position.makeMove(move);
      let score: number;
      if (!this.hasLegalMove()) {
        score = position.inCheck() ? MATE : 0;
      } else {
        score = -this.negamax(depth - 1, -INFINITY, INFINITY, 1, true);
      }
      position.unmakeMove();
      if (this.stopped) break;
      const jittered = score + (Math.random() * 2 - 1) * this.settings.noise;
      if (jittered > bestScore) {
        bestScore = jittered;
        bestMove = move;
        bestRaw = score;
      }
    }
    return { move: bestMove, score: bestRaw };
  }

  /** Iterative deepening with principal variation search over the root moves. */
  private iterate(rootMoves: number[]): { move: number; depth: number; score: number } {
    const position = this.position;
    let bestMove = rootMoves[0];
    let bestScore = 0;
    let reached = 0;
    const started = performance.now();

    for (let depth = 1; depth <= this.settings.maxDepth; depth++) {
      let iterationBest = 0;
      let iterationScore = -INFINITY;
      let alpha = -INFINITY;
      for (let index = 0; index < rootMoves.length; index++) {
        const move = rootMoves[index];
        position.makeMove(move);
        let score: number;
        if (index === 0) {
          score = -this.negamax(depth - 1, -INFINITY, -alpha, 1, true);
        } else {
          score = -this.negamax(depth - 1, -alpha - 1, -alpha, 1, true);
          if (score > alpha && !this.stopped) score = -this.negamax(depth - 1, -INFINITY, -alpha, 1, true);
        }
        position.unmakeMove();
        if (this.stopped) break;
        if (index === 0 || score > iterationScore) {
          iterationBest = move;
          iterationScore = score;
          if (score > alpha) alpha = score;
        }
      }
      if (iterationBest === 0) break;
      // A stopped iteration is still usable: the previous best move was searched first,
      // so any move that displaced it was verified against it.
      bestMove = iterationBest;
      bestScore = iterationScore;
      if (!this.stopped) reached = depth;
      if (this.stopped) break;

      const ordered = [bestMove, ...rootMoves.filter((m) => m !== bestMove)];
      rootMoves.splice(0, rootMoves.length, ...ordered);

      if (Math.abs(bestScore) > MATE_BOUND && depth >= MATE - Math.abs(bestScore)) break;
      if (performance.now() - started > this.settings.timeMs * 0.55) break;
    }
    return { move: bestMove, depth: reached, score: bestScore };
  }

  run(rootMoves: number[], timeScale: number): { move: number; depth: number; score: number } {
    this.deadline = performance.now() + this.settings.timeMs * timeScale;
    ttBound.fill(3);
    const shuffled = [...rootMoves].sort(() => Math.random() - 0.5);

    if (this.settings.randomMoveChance > 0 && Math.random() < this.settings.randomMoveChance) {
      return { move: shuffled[0], depth: 0, score: 0 };
    }
    if (this.settings.noise > 0) {
      const result = this.noisyRoot(shuffled, this.settings.maxDepth);
      return { ...result, depth: this.settings.maxDepth };
    }
    return this.iterate(shuffled);
  }
}

/**
 * Picks the engine's reply for the position reached by playing `moves` from `startFen`.
 * `timeScale` shrinks the time budget, which the tests use to stay fast.
 */
export const chooseMove = (startFen: string, moves: readonly string[], difficulty: Difficulty, timeScale = 1): SearchOutcome => {
  const position = Position.fromFen(startFen);
  for (const uci of moves) {
    const move = position.parseUci(uci);
    if (move === 0) throw new Error(`Illegal move in history: ${uci}`);
    position.makeMove(move);
  }
  const rootMoves = position.legalMoves();
  if (rootMoves.length === 0) return { move: null, depth: 0, score: 0, nodes: 0 };
  if (rootMoves.length === 1) return { move: moveToUci(rootMoves[0]), depth: 0, score: 0, nodes: 0 };

  const useVariety = (difficulty === "hard" || difficulty === "expert") && moves.length < OPENING_PLIES;
  const searcher = new Searcher(position, useVariety ? OPENING_VARIETY : LEVELS[difficulty]);
  const result = searcher.run(rootMoves, timeScale);
  return { move: moveToUci(result.move), depth: result.depth, score: result.score, nodes: searcher.nodes };
};
