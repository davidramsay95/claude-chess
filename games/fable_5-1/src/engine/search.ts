import { opposite, pieceTypeOf } from "./types";
import {
  NO_MOVE,
  isCapture,
  moveCaptured,
  moveFrom,
  movePromotion,
  type Move,
} from "./move";
import type { Position } from "./position";
import { PIECE_VALUE, evaluate } from "./evaluate";

export type Difficulty = "easy" | "medium" | "hard" | "expert";

export interface SearchResult {
  move: Move;
  /** Centipawns from the perspective of the side to move; mate scores are near +-MATE_SCORE. */
  score: number;
  depth: number;
  nodes: number;
  timeMs: number;
}

export const MATE_SCORE = 100000;
const INFINITY = MATE_SCORE + 1000;
const MAX_PLY = 64;
/** Any score beyond this magnitude encodes a forced mate with its distance in plies. */
const MATE_BOUND = MATE_SCORE - MAX_PLY;

export const isMateScore = (score: number): boolean => Math.abs(score) >= MATE_BOUND;

interface DifficultyConfig {
  depth: number;
  quiescence: boolean;
  timeBudgetMs: number;
  /** Probability of ignoring the search and playing a uniformly random legal move. */
  randomMoveProbability: number;
  /** Probability of playing one of the top three scored moves instead of the best. */
  topThreeProbability: number;
}

const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  easy: {
    depth: 1,
    quiescence: false,
    timeBudgetMs: Infinity,
    randomMoveProbability: 0.5,
    topThreeProbability: 0,
  },
  medium: {
    depth: 2,
    quiescence: true,
    timeBudgetMs: Infinity,
    randomMoveProbability: 0,
    topThreeProbability: 0.2,
  },
  hard: {
    depth: 4,
    quiescence: true,
    timeBudgetMs: Infinity,
    randomMoveProbability: 0,
    topThreeProbability: 0,
  },
  expert: {
    depth: 8,
    quiescence: true,
    timeBudgetMs: 2500,
    randomMoveProbability: 0,
    topThreeProbability: 0,
  },
};

const TT_SIZE = 1 << 20;
const TT_MASK = TT_SIZE - 1;
const TT_EXACT = 1;
const TT_LOWER = 2;
const TT_UPPER = 3;

/** Transposition table split across typed arrays so probing and storing allocate nothing. */
const ttKeyLo = new Int32Array(TT_SIZE);
const ttKeyHi = new Int32Array(TT_SIZE);
const ttMove = new Int32Array(TT_SIZE);
const ttScore = new Int32Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttFlag = new Int8Array(TT_SIZE);

const MAX_MOVES_PER_PLY = 256;
const SCORE_TT_MOVE = 1 << 30;
const SCORE_CAPTURE_BASE = 1 << 20;
const SCORE_KILLER_FIRST = (1 << 20) - 1;
const SCORE_KILLER_SECOND = (1 << 20) - 2;
const TIME_CHECK_INTERVAL = 2048;

interface RootMove {
  move: Move;
  score: number;
}

/**
 * Holds all per-search mutable state. The transposition table is shared across searches
 * because a position seen in a previous move's search is likely to come up again.
 */
class Searcher {
  private readonly pos: Position;
  private readonly useQuiescence: boolean;
  private readonly deadline: number;
  private readonly killers = new Int32Array(MAX_PLY * 2);
  private readonly moveScores = new Int32Array(MAX_PLY * MAX_MOVES_PER_PLY);
  nodes = 0;
  aborted = false;
  /** Time checks start only after a full iteration exists to fall back on. */
  private timeChecksEnabled = false;

  constructor(pos: Position, useQuiescence: boolean, deadline: number) {
    this.pos = pos;
    this.useQuiescence = useQuiescence;
    this.deadline = deadline;
  }

  enableTimeChecks(): void {
    this.timeChecksEnabled = true;
  }

  /**
   * Searches every root move to the given depth. With `exactScores` every move gets a full
   * window so the returned list can be ranked; otherwise alpha-beta bounds apply and only
   * the best move's score is exact. Returns null if the clock ran out mid-iteration.
   */
  searchRoot(rootMoves: RootMove[], depth: number, exactScores: boolean): RootMove | null {
    const pos = this.pos;
    const us = pos.turn;
    const searchDepth = pos.inCheck() ? depth + 1 : depth;
    let alpha = -INFINITY;
    let best: RootMove | null = null;
    for (const rootMove of rootMoves) {
      pos.makeMove(rootMove.move);
      // `0 -` rather than unary minus so a drawn line reports +0, not -0.
      const score = 0 - this.negamax(searchDepth - 1, -INFINITY, exactScores ? INFINITY : -alpha, 1);
      pos.undoMove();
      if (this.aborted) return null;
      rootMove.score = score;
      if (best === null || score > best.score) {
        best = rootMove;
        if (score > alpha) alpha = score;
      }
    }
    if (best !== null) {
      this.store(best.move, best.score, searchDepth, TT_EXACT, 0);
    }
    if (pos.turn !== us) throw new Error("Search left the position modified");
    return best;
  }

  private negamax(depth: number, alpha: number, beta: number, ply: number): number {
    const pos = this.pos;
    this.nodes++;
    if (this.timeChecksEnabled && (this.nodes & (TIME_CHECK_INTERVAL - 1)) === 0) {
      if (performance.now() >= this.deadline) this.aborted = true;
    }
    if (this.aborted) return 0;

    if (pos.halfmoveClock >= 100 || pos.repetitionCount() >= 2 || pos.hasInsufficientMaterial()) {
      return 0;
    }
    if (ply >= MAX_PLY) return evaluate(pos);

    // Mate-distance pruning: no line from here can beat a mate already found closer to the root.
    const mateAlpha = Math.max(alpha, -MATE_SCORE + ply);
    const mateBeta = Math.min(beta, MATE_SCORE - ply - 1);
    if (mateAlpha >= mateBeta) return mateAlpha;
    alpha = mateAlpha;
    beta = mateBeta;

    const inCheck = pos.inCheck();
    if (inCheck) depth++;

    if (depth <= 0) {
      return this.useQuiescence ? this.quiescence(alpha, beta, ply) : evaluate(pos);
    }

    const ttIndex = pos.hashLo & TT_MASK;
    let hashMove = NO_MOVE;
    if (ttKeyLo[ttIndex] === pos.hashLo && ttKeyHi[ttIndex] === pos.hashHi) {
      hashMove = ttMove[ttIndex];
      if (ttDepth[ttIndex] >= depth) {
        const score = this.scoreFromTable(ttScore[ttIndex], ply);
        const flag = ttFlag[ttIndex];
        if (flag === TT_EXACT) return score;
        if (flag === TT_LOWER && score >= beta) return score;
        if (flag === TT_UPPER && score <= alpha) return score;
      }
    }

    const us = pos.turn;
    const them = opposite(us);
    const moves = pos.pseudoLegalMoves();
    this.scoreMoves(moves, hashMove, ply);

    const originalAlpha = alpha;
    let bestScore = -INFINITY;
    let bestMove = NO_MOVE;
    let legalCount = 0;
    for (let i = 0; i < moves.length; i++) {
      const move = this.pickNext(moves, i, ply);
      pos.makeMove(move);
      if (pos.isAttacked(pos.kingSquare(us), them)) {
        pos.undoMove();
        continue;
      }
      legalCount++;
      const score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
      pos.undoMove();
      if (this.aborted) return 0;
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
        if (score > alpha) {
          alpha = score;
          if (alpha >= beta) {
            if (!isCapture(move)) this.recordKiller(move, ply);
            break;
          }
        }
      }
    }

    if (legalCount === 0) return inCheck ? -MATE_SCORE + ply : 0;

    const flag = bestScore <= originalAlpha ? TT_UPPER : bestScore >= beta ? TT_LOWER : TT_EXACT;
    this.store(bestMove, bestScore, depth, flag, ply);
    return bestScore;
  }

  private quiescence(alpha: number, beta: number, ply: number): number {
    const pos = this.pos;
    this.nodes++;
    if (this.timeChecksEnabled && (this.nodes & (TIME_CHECK_INTERVAL - 1)) === 0) {
      if (performance.now() >= this.deadline) this.aborted = true;
    }
    if (this.aborted) return 0;

    const standPat = evaluate(pos);
    if (standPat >= beta) return standPat;
    if (standPat > alpha) alpha = standPat;
    if (ply >= MAX_PLY) return standPat;

    const us = pos.turn;
    const them = opposite(us);
    const moves = pos.pseudoLegalMoves();
    // Compact the list to captures and promotions in place; quiet moves are never searched here.
    let tacticalCount = 0;
    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      if (isCapture(move) || movePromotion(move) !== 0) moves[tacticalCount++] = move;
    }
    moves.length = tacticalCount;
    this.scoreMoves(moves, NO_MOVE, ply);

    let bestScore = standPat;
    for (let i = 0; i < moves.length; i++) {
      const move = this.pickNext(moves, i, ply);
      pos.makeMove(move);
      if (pos.isAttacked(pos.kingSquare(us), them)) {
        pos.undoMove();
        continue;
      }
      const score = -this.quiescence(-beta, -alpha, ply + 1);
      pos.undoMove();
      if (this.aborted) return 0;
      if (score > bestScore) {
        bestScore = score;
        if (score > alpha) {
          alpha = score;
          if (alpha >= beta) break;
        }
      }
    }
    return bestScore;
  }

  /** Assigns an ordering score to each move: hash move, then MVV-LVA captures, then killers. */
  private scoreMoves(moves: Move[], hashMove: Move, ply: number): void {
    const scores = this.moveScores;
    const base = ply * MAX_MOVES_PER_PLY;
    const board = this.pos.board;
    const killerFirst = this.killers[ply * 2];
    const killerSecond = this.killers[ply * 2 + 1];
    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      let score = 0;
      if (move === hashMove) {
        score = SCORE_TT_MOVE;
      } else if (isCapture(move) || movePromotion(move) !== 0) {
        const attacker = pieceTypeOf(board[moveFrom(move)]);
        score =
          SCORE_CAPTURE_BASE +
          PIECE_VALUE[moveCaptured(move)] * 16 +
          PIECE_VALUE[movePromotion(move)] -
          attacker;
      } else if (move === killerFirst) {
        score = SCORE_KILLER_FIRST;
      } else if (move === killerSecond) {
        score = SCORE_KILLER_SECOND;
      }
      scores[base + i] = score;
    }
  }

  /** Selection sort step: swaps the best remaining move into slot `index` and returns it. */
  private pickNext(moves: Move[], index: number, ply: number): Move {
    const scores = this.moveScores;
    const base = ply * MAX_MOVES_PER_PLY;
    let bestIndex = index;
    let bestScore = scores[base + index];
    for (let j = index + 1; j < moves.length; j++) {
      if (scores[base + j] > bestScore) {
        bestScore = scores[base + j];
        bestIndex = j;
      }
    }
    if (bestIndex !== index) {
      const tmpMove = moves[index];
      moves[index] = moves[bestIndex];
      moves[bestIndex] = tmpMove;
      scores[base + bestIndex] = scores[base + index];
      scores[base + index] = bestScore;
    }
    return moves[index];
  }

  private recordKiller(move: Move, ply: number): void {
    const slot = ply * 2;
    if (this.killers[slot] === move) return;
    this.killers[slot + 1] = this.killers[slot];
    this.killers[slot] = move;
  }

  private store(move: Move, score: number, depth: number, flag: number, ply: number): void {
    const pos = this.pos;
    const index = pos.hashLo & TT_MASK;
    ttKeyLo[index] = pos.hashLo;
    ttKeyHi[index] = pos.hashHi;
    ttMove[index] = move;
    ttScore[index] = this.scoreToTable(score, ply);
    ttDepth[index] = depth;
    ttFlag[index] = flag;
  }

  /** Mate scores are stored relative to the current node so they stay valid at any ply. */
  private scoreToTable(score: number, ply: number): number {
    if (score >= MATE_BOUND) return score + ply;
    if (score <= -MATE_BOUND) return score - ply;
    return score;
  }

  private scoreFromTable(score: number, ply: number): number {
    if (score >= MATE_BOUND) return score - ply;
    if (score <= -MATE_BOUND) return score + ply;
    return score;
  }
}

const pickRandomIndex = (count: number, random: () => number): number =>
  Math.min(count - 1, Math.floor(random() * count));

/**
 * Chooses a move for the side to move. The position is restored before returning.
 * Throws when the side to move has no legal moves.
 */
export const findBestMove = (
  pos: Position,
  difficulty: Difficulty,
  random: () => number = Math.random,
): SearchResult => {
  const started = performance.now();
  const config = DIFFICULTY_CONFIG[difficulty];
  const legal = pos.legalMoves();
  if (legal.length === 0) throw new Error("No legal moves in position");

  const rootMoves: RootMove[] = legal.map((move) => ({ move, score: -INFINITY }));
  if (config.randomMoveProbability > 0 && random() < config.randomMoveProbability) {
    const move = rootMoves[pickRandomIndex(rootMoves.length, random)].move;
    return { move, score: 0, depth: 0, nodes: 0, timeMs: performance.now() - started };
  }

  const searcher = new Searcher(pos, config.quiescence, started + config.timeBudgetMs);
  const exactScores = config.topThreeProbability > 0;
  let best: RootMove = rootMoves[0];
  let completedDepth = 0;
  for (let depth = 1; depth <= config.depth; depth++) {
    const result = searcher.searchRoot(rootMoves, depth, exactScores);
    if (result === null) break;
    // Copy, because an aborted later iteration overwrites scores in the shared root list.
    best = { move: result.move, score: result.score };
    completedDepth = depth;
    searcher.enableTimeChecks();
    // Deeper iterations cannot shorten a mate already found, so stop once one is proven.
    if (best.score >= MATE_BOUND) break;
    // Searching the previous iteration's best line first makes the next iteration cut sooner.
    rootMoves.sort((a, b) => b.score - a.score);
  }

  let chosen = best;
  if (exactScores && random() < config.topThreeProbability) {
    const ranked = [...rootMoves].sort((a, b) => b.score - a.score);
    chosen = ranked[pickRandomIndex(Math.min(3, ranked.length), random)];
  }

  return {
    move: chosen.move,
    score: chosen.score,
    depth: completedDepth,
    nodes: searcher.nodes,
    timeMs: performance.now() - started,
  };
};
