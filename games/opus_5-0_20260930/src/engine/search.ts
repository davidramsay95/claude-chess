/**
 * The opponent. A negamax alpha-beta search with iterative deepening, a
 * transposition table, quiescence search, null-move pruning, late move
 * reductions, killer moves and a history heuristic.
 *
 * The four difficulty levels differ along three axes rather than just depth:
 * how deep and how long they may search, whether quiescence search runs at all,
 * and how much score noise they tolerate when picking the root move. Switching
 * quiescence off is what makes the easy level genuinely beatable: it walks into
 * recaptures, the way a beginner does.
 */

import { Game } from "./game.ts";
import { evaluate, evaluateMaterial } from "./evaluate.ts";
import {
  Position,
  moveCaptured,
  moveFrom,
  movePromotion,
  moveTo,
  moveToUci,
} from "./position.ts";
import type { Difficulty } from "./difficulty.ts";

export const MATE = 30000;
export const MATE_THRESHOLD = 29000;
const INFINITE = 32000;

const MAX_SEARCH_PLY = 64;
const TT_BITS = 20;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const FLAG_EXACT = 0;
const FLAG_LOWER = 1;
const FLAG_UPPER = 2;

/** Rough values used only for move ordering and delta pruning. */
const VICTIM_VALUE = [0, 100, 320, 330, 500, 900, 20000];
const DELTA_MARGIN = 200;

export interface SearchResult {
  /** Packed move, or 0 when the game is already over. */
  move: number;
  uci: string;
  /** Centipawns from the engine's point of view. */
  score: number;
  /** Deepest iteration that finished. */
  depth: number;
  nodes: number;
  timeMs: number;
  pv: string[];
}

interface LevelConfig {
  maxDepth: number;
  timeMs: number;
  /** Root moves within this many centipawns of the best are candidates. */
  scoreWindow: number;
  quiescence: boolean;
  fullEval: boolean;
}

const LEVELS: Record<Difficulty, LevelConfig> = {
  easy: { maxDepth: 2, timeMs: 400, scoreWindow: 110, quiescence: false, fullEval: false },
  medium: { maxDepth: 4, timeMs: 900, scoreWindow: 40, quiescence: true, fullEval: true },
  hard: { maxDepth: 7, timeMs: 1600, scoreWindow: 0, quiescence: true, fullEval: true },
  expert: { maxDepth: 48, timeMs: 3400, scoreWindow: 0, quiescence: true, fullEval: true },
};

interface RootMove {
  move: number;
  score: number;
}

class Searcher {
  private pos = new Position();
  private config: LevelConfig = LEVELS.medium;
  private nodes = 0;
  private deadline = Number.POSITIVE_INFINITY;
  private aborted = false;

  private readonly ttLock = new Int32Array(TT_SIZE);
  private readonly ttMove = new Int32Array(TT_SIZE);
  private readonly ttScore = new Int32Array(TT_SIZE);
  private readonly ttDepth = new Int8Array(TT_SIZE);
  private readonly ttFlag = new Int8Array(TT_SIZE);
  private ttFilled = false;

  private readonly killers = new Int32Array(MAX_SEARCH_PLY * 2);
  private readonly historyTable = new Int32Array(15 * 128);
  private readonly repHi = new Int32Array(2048);
  private readonly repLo = new Int32Array(2048);
  private repCount = 0;

  private readonly pvTable = new Int32Array(MAX_SEARCH_PLY * MAX_SEARCH_PLY);
  private readonly pvLength = new Int32Array(MAX_SEARCH_PLY);

  think(game: Game, difficulty: Difficulty, random: () => number = Math.random): SearchResult {
    const started = Date.now();
    const empty: SearchResult = {
      move: 0,
      uci: "",
      score: 0,
      depth: 0,
      nodes: 0,
      timeMs: 0,
      pv: [],
    };
    if (game.status().over) return empty;

    this.config = LEVELS[difficulty];
    this.pos = game.position.clone();
    this.nodes = 0;
    this.aborted = false;
    this.deadline = started + this.config.timeMs;
    this.killers.fill(0);
    this.historyTable.fill(0);
    if (this.ttFilled) {
      this.ttLock.fill(0);
      this.ttDepth.fill(0);
      this.ttMove.fill(0);
    }
    this.ttFilled = true;

    const history = game.hashHistory();
    this.repCount = 0;
    for (let i = 0; i + 1 < history.length && this.repCount < this.repHi.length; i += 2) {
      this.repHi[this.repCount] = history[i];
      this.repLo[this.repCount] = history[i + 1];
      this.repCount++;
    }

    let rootMoves: RootMove[] = this.pos.legalMoves().map((move) => ({ move, score: -INFINITE }));
    if (rootMoves.length === 0) return empty;

    let completed: RootMove[] = rootMoves;
    let completedDepth = 0;
    let pv: string[] = [];

    for (let depth = 1; depth <= this.config.maxDepth; depth++) {
      const searched = this.searchRoot(rootMoves, depth);
      if (this.aborted) break;
      completed = searched;
      completedDepth = depth;
      pv = this.principalVariation();
      rootMoves = searched;
      if (Math.abs(searched[0].score) > MATE_THRESHOLD) break;
      if (Date.now() >= this.deadline) break;
    }

    const chosen = this.pickRootMove(completed, random);
    return {
      move: chosen.move,
      uci: moveToUci(chosen.move),
      score: chosen.score,
      depth: completedDepth,
      nodes: this.nodes,
      timeMs: Date.now() - started,
      pv: chosen.move === completed[0].move ? pv : [moveToUci(chosen.move)],
    };
  }

  /**
   * Picks among the root moves close enough to the best one. Levels with a zero
   * window always take the best move; the others weight the candidates so the
   * near-best ones still come up most often.
   */
  private pickRootMove(moves: RootMove[], random: () => number): RootMove {
    const window = this.config.scoreWindow;
    const best = moves[0];
    if (window <= 0 || Math.abs(best.score) > MATE_THRESHOLD) return best;
    const candidates = moves.filter((entry) => best.score - entry.score <= window);
    if (candidates.length <= 1) return best;
    const weights = candidates.map((entry) => window - (best.score - entry.score) + 1);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let ticket = random() * total;
    for (let i = 0; i < candidates.length; i++) {
      ticket -= weights[i];
      if (ticket <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  /**
   * One iteration of the root search.
   *
   * Levels that pick randomly among near-best moves need every root score to be
   * directly comparable, so they search each move on a full window. Levels that
   * only ever play the best move use principal-variation search instead, and
   * push each fail-low result just below the current best: a fail-low score is
   * only an upper bound, and letting one tie with the real best score would let
   * an inferior move win the sort.
   */
  private searchRoot(rootMoves: RootMove[], depth: number): RootMove[] {
    const exactScores = this.config.scoreWindow > 0;
    let alpha = -INFINITE;
    const beta = INFINITE;
    const results: RootMove[] = [];
    this.pvLength[0] = 0;
    let first = true;

    for (const entry of rootMoves) {
      if (!this.pos.makeMoveIfLegal(entry.move)) continue;
      this.pushRepetition();
      let score: number;
      if (first || exactScores) {
        score = -this.searchNode(depth - 1, -beta, exactScores ? INFINITE : -alpha, 1, true);
      } else {
        score = -this.searchNode(depth - 1, -alpha - 1, -alpha, 1, true);
        if (score > alpha) {
          score = -this.searchNode(depth - 1, -beta, -alpha, 1, true);
        } else {
          score = Math.min(score, alpha - 1);
        }
      }
      this.popRepetition();
      this.pos.unmakeMove();
      if (this.aborted) return rootMoves;

      results.push({ move: entry.move, score });
      if (score > alpha) {
        alpha = score;
        this.updatePv(0, entry.move);
      }
      first = false;
    }

    results.sort((a, b) => b.score - a.score);
    return results.length > 0 ? results : rootMoves;
  }

  private searchNode(depth: number, alphaIn: number, beta: number, ply: number, allowNull: boolean): number {
    this.pvLength[ply] = ply;
    let alpha = alphaIn;

    if ((this.nodes & 1023) === 0 && Date.now() >= this.deadline) {
      this.aborted = true;
      return 0;
    }
    this.nodes++;

    if (this.pos.halfmoveClock >= 100 || this.isRepetition()) return 0;

    // Mate distance pruning: a mate found nearer the root always wins.
    alpha = Math.max(alpha, -MATE + ply);
    const ceiling = Math.min(beta, MATE - ply - 1);
    if (alpha >= ceiling) return alpha;

    if (depth <= 0) {
      return this.config.quiescence ? this.quiesce(alpha, ceiling, ply) : this.staticEval();
    }

    const inCheck = this.pos.isCheck();
    if (inCheck && ply < MAX_SEARCH_PLY - 2) depth++;

    const index = this.pos.hashHi & TT_MASK;
    let ttMove = 0;
    if (this.ttLock[index] === this.pos.hashLo) {
      ttMove = this.ttMove[index];
      if (this.ttDepth[index] >= depth) {
        const stored = this.scoreFromTt(this.ttScore[index], ply);
        const flag = this.ttFlag[index];
        if (flag === FLAG_EXACT) return stored;
        if (flag === FLAG_LOWER && stored >= ceiling) return stored;
        if (flag === FLAG_UPPER && stored <= alpha) return stored;
      }
    }

    if (
      allowNull &&
      !inCheck &&
      depth >= 3 &&
      ceiling - alpha === 1 &&
      this.pos.hasNonPawnMaterial()
    ) {
      const reduction = 2 + ((depth / 6) | 0);
      this.pos.makeNullMove();
      this.pushRepetition();
      const score = -this.searchNode(depth - 1 - reduction, -ceiling, -ceiling + 1, ply + 1, false);
      this.popRepetition();
      this.pos.unmakeNullMove();
      if (this.aborted) return 0;
      if (score >= ceiling) return ceiling;
    }

    const moves = this.pos.generateMoves();
    const ordering = moves.map((move) => this.orderingScore(move, ttMove, ply));
    let best = -INFINITE;
    let bestMove = 0;
    let flag = FLAG_UPPER;
    let searched = 0;

    for (let picked = 0; picked < moves.length; picked++) {
      let choice = picked;
      for (let candidate = picked + 1; candidate < moves.length; candidate++) {
        if (ordering[candidate] > ordering[choice]) choice = candidate;
      }
      if (choice !== picked) {
        [moves[picked], moves[choice]] = [moves[choice], moves[picked]];
        [ordering[picked], ordering[choice]] = [ordering[choice], ordering[picked]];
      }
      const move = moves[picked];
      if (!this.pos.makeMoveIfLegal(move)) continue;
      this.pushRepetition();

      const quiet = moveCaptured(move) === 0 && movePromotion(move) === 0;
      const givesCheck = this.pos.isCheck();
      let score: number;

      if (searched === 0) {
        score = -this.searchNode(depth - 1, -ceiling, -alpha, ply + 1, true);
      } else {
        let reduction = 0;
        if (depth >= 3 && searched >= 3 && quiet && !inCheck && !givesCheck) {
          reduction = searched >= 6 && depth >= 5 ? 2 : 1;
        }
        score = -this.searchNode(depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && reduction > 0) {
          score = -this.searchNode(depth - 1, -alpha - 1, -alpha, ply + 1, true);
        }
        if (score > alpha && score < ceiling) {
          score = -this.searchNode(depth - 1, -ceiling, -alpha, ply + 1, true);
        }
      }

      this.popRepetition();
      this.pos.unmakeMove();
      if (this.aborted) return 0;
      searched++;

      if (score > best) {
        best = score;
        bestMove = move;
        if (score > alpha) {
          alpha = score;
          flag = FLAG_EXACT;
          this.updatePv(ply, move);
          if (score >= ceiling) {
            flag = FLAG_LOWER;
            if (quiet) {
              const slot = ply * 2;
              if (this.killers[slot] !== move) {
                this.killers[slot + 1] = this.killers[slot];
                this.killers[slot] = move;
              }
              this.historyTable[this.pos.pieceAt(moveFrom(move)) * 128 + moveTo(move)] +=
                depth * depth;
            }
            break;
          }
        }
      }
    }

    if (searched === 0) return inCheck ? -MATE + ply : 0;

    this.ttLock[index] = this.pos.hashLo;
    this.ttMove[index] = bestMove;
    this.ttScore[index] = this.scoreToTt(best, ply);
    this.ttDepth[index] = Math.min(depth, 127);
    this.ttFlag[index] = flag;
    return best;
  }

  private quiesce(alphaIn: number, beta: number, ply: number): number {
    if ((this.nodes & 1023) === 0 && Date.now() >= this.deadline) {
      this.aborted = true;
      return 0;
    }
    this.nodes++;

    const standPat = this.staticEval();
    if (standPat >= beta) return standPat;
    let best = standPat;
    let alpha = Math.max(alphaIn, standPat);
    if (ply >= MAX_SEARCH_PLY - 2) return standPat;

    const moves = this.pos.generateMoves(true);
    const ordering = moves.map((move) => this.orderingScore(move, 0, ply));

    for (let picked = 0; picked < moves.length; picked++) {
      let choice = picked;
      for (let candidate = picked + 1; candidate < moves.length; candidate++) {
        if (ordering[candidate] > ordering[choice]) choice = candidate;
      }
      if (choice !== picked) {
        [moves[picked], moves[choice]] = [moves[choice], moves[picked]];
        [ordering[picked], ordering[choice]] = [ordering[choice], ordering[picked]];
      }
      const move = moves[picked];
      const captured = moveCaptured(move);
      if (
        captured !== 0 &&
        movePromotion(move) === 0 &&
        standPat + VICTIM_VALUE[captured & 7] + DELTA_MARGIN < alpha
      ) {
        continue;
      }
      if (!this.pos.makeMoveIfLegal(move)) continue;
      const score = -this.quiesce(-beta, -alpha, ply + 1);
      this.pos.unmakeMove();
      if (this.aborted) return 0;
      if (score > best) {
        best = score;
        if (score > alpha) alpha = score;
        if (score >= beta) return score;
      }
    }
    return best;
  }

  private staticEval(): number {
    return this.config.fullEval ? evaluate(this.pos) : evaluateMaterial(this.pos);
  }

  private orderingScore(move: number, ttMove: number, ply: number): number {
    if (move === ttMove) return 1_000_000;
    const promotion = movePromotion(move);
    if (promotion) return 800_000 + promotion * 100;
    const captured = moveCaptured(move);
    if (captured) {
      const attacker = this.pos.pieceTypeAt(moveFrom(move));
      return 500_000 + VICTIM_VALUE[captured & 7] * 16 - VICTIM_VALUE[attacker];
    }
    const slot = ply * 2;
    if (move === this.killers[slot]) return 400_000;
    if (move === this.killers[slot + 1]) return 390_000;
    return this.historyTable[this.pos.pieceAt(moveFrom(move)) * 128 + moveTo(move)];
  }

  /** Mate scores are stored relative to the node, not the root. */
  private scoreToTt(score: number, ply: number): number {
    if (score > MATE_THRESHOLD) return score + ply;
    if (score < -MATE_THRESHOLD) return score - ply;
    return score;
  }
  private scoreFromTt(score: number, ply: number): number {
    if (score > MATE_THRESHOLD) return score - ply;
    if (score < -MATE_THRESHOLD) return score + ply;
    return score;
  }

  private pushRepetition(): void {
    if (this.repCount < this.repHi.length) {
      this.repHi[this.repCount] = this.pos.hashHi;
      this.repLo[this.repCount] = this.pos.hashLo;
    }
    this.repCount++;
  }
  private popRepetition(): void {
    this.repCount--;
  }

  private isRepetition(): boolean {
    const hi = this.pos.hashHi;
    const lo = this.pos.hashLo;
    const floor = Math.max(0, this.repCount - 1 - this.pos.halfmoveClock);
    for (let i = this.repCount - 3; i >= floor; i -= 2) {
      if (this.repHi[i] === hi && this.repLo[i] === lo) return true;
    }
    return false;
  }

  private updatePv(ply: number, move: number): void {
    const row = ply * MAX_SEARCH_PLY;
    this.pvTable[row + ply] = move;
    const childLength = this.pvLength[ply + 1] ?? ply + 1;
    for (let next = ply + 1; next < childLength; next++) {
      this.pvTable[row + next] = this.pvTable[(ply + 1) * MAX_SEARCH_PLY + next];
    }
    this.pvLength[ply] = Math.max(childLength, ply + 1);
  }

  private principalVariation(): string[] {
    const line: string[] = [];
    for (let ply = 0; ply < this.pvLength[0] && ply < MAX_SEARCH_PLY; ply++) {
      const move = this.pvTable[ply];
      if (!move) break;
      line.push(moveToUci(move));
    }
    return line;
  }
}

export function createSearcher(): Searcher {
  return new Searcher();
}

export type { Searcher };
