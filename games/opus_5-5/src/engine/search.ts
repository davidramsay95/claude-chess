import {
  BISHOP,
  type Color,
  FLAG_EN_PASSANT,
  isCapture,
  KNIGHT,
  type Move,
  moveFlags,
  moveFrom,
  movePromotion,
  moveTo,
  NO_MOVE,
  PAWN,
  QUEEN,
  ROOK,
} from "../chess/move";
import { BOARD_SQUARES, Position } from "../chess/position";
import { evaluate } from "./evaluate";
import { BOUND_EXACT, BOUND_LOWER, BOUND_UPPER, TranspositionTable } from "./transpositionTable";

/** Score of delivering checkmate on the next move; mates further away score one less per ply. */
export const MATE_SCORE = 30000;
/** Any score beyond this magnitude is a forced mate rather than a material evaluation. */
const MATE_BOUND = MATE_SCORE - 1000;
const INFINITE = 32000;
const MAX_PLY = 100;
const MAX_MOVES = 256;
/** Reading the clock is comparatively slow, so it is only consulted once per this many nodes. */
const NODES_PER_TIME_CHECK = 1024;
/** Stop deepening once this share of the budget is spent: the next iteration would rarely finish. */
const ITERATION_START_CUTOFF = 0.55;
const DEFAULT_TABLE_BITS = 20;

/** Rough piece values for move ordering and delta pruning, indexed by piece type. */
const ORDER_VALUES = [0, 100, 320, 330, 500, 900, 2000];
const DELTA_MARGIN = 200;
const REVERSE_FUTILITY_MARGIN = 120;

const TT_MOVE_ORDER = 1 << 30;
const CAPTURE_ORDER = 1 << 28;
const FIRST_KILLER_ORDER = CAPTURE_ORDER - 1000;
const SECOND_KILLER_ORDER = CAPTURE_ORDER - 2000;
const UNDERPROMOTION_ORDER = -(1 << 28);
/** History scores are halved when any reaches this, keeping them below the killer scores. */
const HISTORY_LIMIT = 1 << 20;

/** Late move reductions grow with both depth and move number; precomputed as `[depth * 64 + moveNumber]`. */
const LATE_MOVE_REDUCTIONS = (() => {
  const table = new Int8Array(64 * 64);
  for (let depth = 1; depth < 64; depth++) {
    for (let moveNumber = 1; moveNumber < 64; moveNumber++) {
      table[depth * 64 + moveNumber] = Math.floor(0.75 + (Math.log(depth) * Math.log(moveNumber)) / 2.25);
    }
  }
  return table;
})();

/** What a search may spend and how many root alternatives it should score exactly. */
export interface SearchLimits {
  /** Deepest iteration to run, in plies. */
  maxDepth: number;
  /** Wall-clock budget in milliseconds. Depth 1 always completes, even past the budget. */
  timeLimitMs: number;
  /**
   * Root moves scoring within this many centipawns of the best are returned as candidates with exact
   * scores. 0 returns the best move alone and is the fastest setting.
   */
  candidateMargin: number;
}

/** A root move with its score in centipawns for the side to move. */
export interface ScoredMove {
  move: Move;
  score: number;
}

export interface SearchResult {
  bestMove: Move;
  /** Score of `bestMove` for the side to move; mate in n moves is `MATE_SCORE - (2n - 1)`. */
  score: number;
  /** Moves within the candidate margin of the best, best first. Always contains `bestMove`. */
  candidates: ScoredMove[];
  /** Deepest iteration whose result was used; 0 when the only legal move was returned without searching. */
  depth: number;
  nodes: number;
  elapsedMs: number;
}

export interface SearcherOptions {
  /** The transposition table has `2 ** bits` entries of about 12 bytes. Defaults to 20 (about 12 MB). */
  transpositionTableBits?: number;
  /** Millisecond clock, injectable for tests. Defaults to `performance.now`. */
  now?: () => number;
}

/** The usable outcome of one iterative-deepening iteration. */
interface CompletedIteration {
  candidates: ScoredMove[];
  depth: number;
}

/** True when a score means a forced mate for either side. */
export const isMateScore = (score: number): boolean => Math.abs(score) >= MATE_BOUND;

/** Mate scores are stored relative to the node rather than the root, so they stay valid when reached at another ply. */
const scoreToTable = (score: number, ply: number): number =>
  score >= MATE_BOUND ? score + ply : score <= -MATE_BOUND ? score - ply : score;

const scoreFromTable = (score: number, ply: number): number =>
  score >= MATE_BOUND ? score - ply : score <= -MATE_BOUND ? score + ply : score;

/** Null-move pruning is unsound in zugzwang-prone endings where the side to move has only king and pawns. */
const hasPieces = (position: Position, color: Color): boolean => {
  const board = position.board;
  for (let index = 0; index < 64; index++) {
    const piece = board[BOARD_SQUARES[index]];
    if (piece !== 0 && piece >> 3 === color) {
      const type = piece & 7;
      if (type === KNIGHT || type === BISHOP || type === ROOK || type === QUEEN) return true;
    }
  }
  return false;
};

/**
 * Iterative-deepening alpha-beta searcher (principal variation search with quiescence, transposition
 * table, null-move pruning, late move reductions and killer/history move ordering).
 * Reuse one instance across moves of a game so the transposition table keeps its knowledge.
 */
export class Searcher {
  private readonly table: TranspositionTable;
  private readonly now: () => number;
  private readonly moveLists: Move[][] = Array.from({ length: MAX_PLY + 1 }, () => []);
  private readonly orderScores = new Int32Array((MAX_PLY + 1) * MAX_MOVES);
  private readonly killers = new Int32Array((MAX_PLY + 1) * 2);
  private readonly history = new Int32Array(16 * 128);
  private position = new Position();
  private nodes = 0;
  private deadline = 0;
  private stopped = false;
  /** Time checks are disabled until depth 1 completes so a legal, searched move always exists. */
  private canStop = false;

  constructor(options: SearcherOptions = {}) {
    this.table = new TranspositionTable(options.transpositionTableBits ?? DEFAULT_TABLE_BITS);
    this.now = options.now ?? ((): number => performance.now());
  }

  /** Forgets everything learned in earlier searches, e.g. when a new game starts. */
  clear(): void {
    this.table.clear();
  }

  /**
   * Searches `position` (left unchanged afterwards) and returns the best move found within the limits.
   * Throws when the side to move has no legal moves.
   */
  search(position: Position, limits: SearchLimits): SearchResult {
    const started = this.now();
    const rootMoves = position.generateLegalMoves();
    if (rootMoves.length === 0) throw new Error("Cannot search a position with no legal moves");
    if (rootMoves.length === 1) {
      return { bestMove: rootMoves[0], score: 0, candidates: [{ move: rootMoves[0], score: 0 }], depth: 0, nodes: 0, elapsedMs: 0 };
    }

    this.prepare(position, started + limits.timeLimitMs);
    this.orderRootMoves(rootMoves);
    const scores = new Int32Array(rootMoves.length);
    const exact = new Uint8Array(rootMoves.length);
    let completed: CompletedIteration | null = null;

    for (let depth = 1; depth <= Math.min(limits.maxDepth, MAX_PLY - 1); depth++) {
      const bestIndex = this.searchRoot(rootMoves, depth, limits.candidateMargin, scores, exact);
      if (this.stopped) {
        // A move that beat the previous best at the new depth is trusted even though the iteration is unfinished.
        if (bestIndex > 0) completed = { candidates: [{ move: rootMoves[bestIndex], score: scores[bestIndex] }], depth };
        break;
      }
      completed = { candidates: this.collectCandidates(rootMoves, scores, exact, bestIndex, limits.candidateMargin), depth };
      this.sortRootMoves(rootMoves, scores, exact);
      this.canStop = true;

      const bestScore = completed.candidates[0].score;
      if (isMateScore(bestScore) && MATE_SCORE - Math.abs(bestScore) <= depth) break;
      if (this.now() - started >= limits.timeLimitMs * ITERATION_START_CUTOFF) break;
    }

    if (completed === null) throw new Error("Search finished without completing depth 1");
    const [best] = completed.candidates;
    return {
      bestMove: best.move,
      score: best.score,
      candidates: completed.candidates,
      depth: completed.depth,
      nodes: this.nodes,
      elapsedMs: this.now() - started,
    };
  }

  private prepare(position: Position, deadline: number): void {
    this.position = position;
    this.deadline = deadline;
    this.nodes = 0;
    this.stopped = false;
    this.canStop = false;
    this.killers.fill(0);
    this.history.fill(0);
  }

  private orderRootMoves(moves: Move[]): void {
    const entry = this.table.probe(this.position.hashLo, this.position.hashHi);
    const ttMove = entry >= 0 ? this.table.moveAt(entry) : NO_MOVE;
    const keys = new Map(moves.map((move) => [move, this.orderScore(move, 0, ttMove)]));
    moves.sort((a, b) => (keys.get(b) ?? 0) - (keys.get(a) ?? 0));
  }

  /**
   * Searches every root move at `depth`. The first move gets a full window; later moves are first tested
   * against `bestScore - margin` with a null window and re-searched for an exact score only if they reach it.
   * Returns the index of the best move among those finished, or -1 if none finished.
   */
  private searchRoot(moves: Move[], depth: number, margin: number, scores: Int32Array, exact: Uint8Array): number {
    const position = this.position;
    let bestScore = -INFINITE;
    let bestIndex = -1;
    exact.fill(0);
    for (let index = 0; index < moves.length; index++) {
      const move = moves[index];
      const floor = bestScore - margin;
      position.makeMove(move);
      let score: number;
      if (isCapture(move) && position.isInsufficientMaterial()) {
        score = 0;
      } else if (index === 0) {
        score = -this.negamax(depth - 1, -INFINITE, INFINITE, 1, true);
      } else {
        score = -this.negamax(depth - 1, -floor - 1, -floor, 1, true);
        if (score > floor && !this.stopped) score = -this.negamax(depth - 1, -INFINITE, -floor, 1, true);
      }
      position.unmakeMove();
      if (this.stopped) break;
      scores[index] = score;
      exact[index] = index === 0 || score > floor ? 1 : 0;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    return bestIndex;
  }

  private collectCandidates(moves: Move[], scores: Int32Array, exact: Uint8Array, bestIndex: number, margin: number): ScoredMove[] {
    const bestScore = scores[bestIndex];
    const candidates: ScoredMove[] = [];
    for (let index = 0; index < moves.length; index++) {
      if (exact[index] && scores[index] >= bestScore - margin) candidates.push({ move: moves[index], score: scores[index] });
    }
    // Stable sort keeps the best move ahead of any move that tied with it.
    return candidates.sort((a, b) => b.score - a.score);
  }

  /** Orders root moves best first for the next iteration, keeping `scores` and `exact` aligned with them. */
  private sortRootMoves(moves: Move[], scores: Int32Array, exact: Uint8Array): void {
    const order = moves.map((_, index) => index).sort((a, b) => scores[b] - scores[a]);
    const sortedMoves = order.map((index) => moves[index]);
    const sortedScores = order.map((index) => scores[index]);
    const sortedExact = order.map((index) => exact[index]);
    for (let index = 0; index < moves.length; index++) {
      moves[index] = sortedMoves[index];
      scores[index] = sortedScores[index];
      exact[index] = sortedExact[index];
    }
  }

  private negamax(requestedDepth: number, alpha: number, beta: number, ply: number, allowNull: boolean): number {
    const position = this.position;
    if (position.halfmoveClock >= 100 || position.repetitionCount() >= 2) return 0;
    const inCheck = position.inCheck();
    // Check extension: never let the horizon fall in the middle of a forcing sequence.
    const depth = inCheck ? requestedDepth + 1 : requestedDepth;
    if (depth <= 0) return this.quiescence(alpha, beta, ply);
    if (this.tick()) return 0;
    if (ply >= MAX_PLY) return evaluate(position);

    // Mate distance pruning: no line from here can beat a mate already found closer to the root.
    alpha = Math.max(alpha, -MATE_SCORE + ply);
    beta = Math.min(beta, MATE_SCORE - ply - 1);
    if (alpha >= beta) return alpha;

    const isPrincipalVariation = beta - alpha > 1;
    const entry = this.table.probe(position.hashLo, position.hashHi);
    const ttMove = entry >= 0 ? this.table.moveAt(entry) : NO_MOVE;
    if (entry >= 0 && !isPrincipalVariation && this.table.depthAt(entry) >= depth) {
      const score = scoreFromTable(this.table.scoreAt(entry), ply);
      const bound = this.table.boundAt(entry);
      if (bound === BOUND_EXACT || (bound === BOUND_LOWER && score >= beta) || (bound === BOUND_UPPER && score <= alpha)) {
        return score;
      }
    }

    if (!inCheck && !isPrincipalVariation) {
      const pruned = this.tryStaticPruning(depth, beta, ply, allowNull);
      if (pruned !== null) return pruned;
      if (this.stopped) return 0;
    }

    const moves = this.moveLists[ply];
    moves.length = 0;
    position.generatePseudoMoves(moves, false);
    this.scoreMoves(moves, ply, ttMove);

    const originalAlpha = alpha;
    let bestScore = -INFINITE;
    let bestMove = NO_MOVE;
    let legalMoves = 0;
    for (let index = 0; index < moves.length; index++) {
      const move = this.pickNext(moves, index, ply);
      position.makeMove(move);
      if (position.lastMoveLeftKingInCheck()) {
        position.unmakeMove();
        continue;
      }
      legalMoves += 1;
      const quiet = !isCapture(move) && movePromotion(move) === 0;
      const score = this.searchChild(move, depth, alpha, beta, ply, legalMoves, quiet && !inCheck);
      position.unmakeMove();
      if (this.stopped) return 0;

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
        if (score > alpha) {
          alpha = score;
          if (score >= beta) {
            if (quiet) this.rewardQuietCutoff(move, depth, ply);
            break;
          }
        }
      }
    }

    if (legalMoves === 0) return inCheck ? -MATE_SCORE + ply : 0;
    const bound = bestScore >= beta ? BOUND_LOWER : bestScore > originalAlpha ? BOUND_EXACT : BOUND_UPPER;
    this.table.store(position.hashLo, position.hashHi, depth, bound, scoreToTable(bestScore, ply), bestMove);
    return bestScore;
  }

  /**
   * Reverse futility and null-move pruning for non-PV nodes not in check.
   * Returns a score to cut off with, or null to search normally.
   */
  private tryStaticPruning(depth: number, beta: number, ply: number, allowNull: boolean): number | null {
    const position = this.position;
    const staticEval = evaluate(position);
    if (depth <= 3 && Math.abs(beta) < MATE_BOUND && staticEval - REVERSE_FUTILITY_MARGIN * depth >= beta) return staticEval;
    if (!allowNull || depth < 3 || staticEval < beta || !hasPieces(position, position.turn)) return null;

    const reduction = depth >= 7 ? 3 : 2;
    position.makeNullMove();
    const score = -this.negamax(depth - 1 - reduction, -beta, -beta + 1, ply + 1, false);
    position.unmakeNullMove();
    if (this.stopped || score < beta) return null;
    // A null-move mate score is not a real mate line, so it is reported as a plain fail-high.
    return score >= MATE_BOUND ? beta : score;
  }

  /** Searches one child (already made on the board) with PVS and late move reductions. */
  private searchChild(move: Move, depth: number, alpha: number, beta: number, ply: number, moveNumber: number, reducible: boolean): number {
    const position = this.position;
    if (isCapture(move) && position.isInsufficientMaterial()) return 0;
    if (moveNumber === 1) return -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);

    let reduction = 0;
    if (reducible && depth >= 3 && moveNumber > 3 && !this.isKiller(move, ply) && !position.inCheck()) {
      reduction = Math.min(LATE_MOVE_REDUCTIONS[Math.min(depth, 63) * 64 + Math.min(moveNumber, 63)], depth - 2);
    }
    let score = -this.negamax(depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, true);
    if (score > alpha && reduction > 0 && !this.stopped) score = -this.negamax(depth - 1, -alpha - 1, -alpha, ply + 1, true);
    if (score > alpha && score < beta && !this.stopped) score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
    return score;
  }

  /** Captures-only search that settles tactical exchanges before trusting the static evaluation. */
  private quiescence(alpha: number, beta: number, ply: number): number {
    if (this.tick()) return 0;
    const position = this.position;
    const standPat = evaluate(position);
    if (ply >= MAX_PLY || standPat >= beta) return standPat;
    if (standPat > alpha) alpha = standPat;

    const moves = this.moveLists[ply];
    moves.length = 0;
    position.generatePseudoMoves(moves, true);
    this.scoreMoves(moves, ply, NO_MOVE);

    let bestScore = standPat;
    for (let index = 0; index < moves.length; index++) {
      const move = this.pickNext(moves, index, ply);
      // Delta pruning: even winning this piece outright cannot lift the score to alpha.
      if (movePromotion(move) === 0 && standPat + ORDER_VALUES[this.victimType(move)] + DELTA_MARGIN <= alpha) continue;
      position.makeMove(move);
      if (position.lastMoveLeftKingInCheck()) {
        position.unmakeMove();
        continue;
      }
      const score = -this.quiescence(-beta, -alpha, ply + 1);
      position.unmakeMove();
      if (this.stopped) return 0;
      if (score > bestScore) {
        bestScore = score;
        if (score > alpha) {
          alpha = score;
          if (score >= beta) break;
        }
      }
    }
    return bestScore;
  }

  /** Counts a node and reports whether the search must stop. */
  private tick(): boolean {
    this.nodes += 1;
    if (this.canStop && (this.nodes & (NODES_PER_TIME_CHECK - 1)) === 0 && this.now() >= this.deadline) this.stopped = true;
    return this.stopped;
  }

  private victimType(move: Move): number {
    return moveFlags(move) & FLAG_EN_PASSANT ? PAWN : this.position.board[moveTo(move)] & 7;
  }

  /** Ordering key: TT move, then captures by most valuable victim / least valuable attacker, killers, history. */
  private orderScore(move: Move, ply: number, ttMove: Move): number {
    if (move === ttMove) return TT_MOVE_ORDER;
    const promotion = movePromotion(move);
    if (promotion !== 0 && promotion !== QUEEN) return UNDERPROMOTION_ORDER;
    if (isCapture(move) || promotion !== 0) {
      const attacker = this.position.board[moveFrom(move)] & 7;
      return CAPTURE_ORDER + ORDER_VALUES[this.victimType(move)] * 8 + ORDER_VALUES[promotion] * 8 - attacker;
    }
    if (move === this.killers[ply * 2]) return FIRST_KILLER_ORDER;
    if (move === this.killers[ply * 2 + 1]) return SECOND_KILLER_ORDER;
    return this.history[this.position.board[moveFrom(move)] * 128 + moveTo(move)];
  }

  private scoreMoves(moves: Move[], ply: number, ttMove: Move): void {
    const base = ply * MAX_MOVES;
    for (let index = 0; index < moves.length; index++) this.orderScores[base + index] = this.orderScore(moves[index], ply, ttMove);
  }

  /** Selection sort step: moves the best remaining move to `index`. Cheap because cutoffs usually come early. */
  private pickNext(moves: Move[], index: number, ply: number): Move {
    const base = ply * MAX_MOVES;
    let bestIndex = index;
    for (let candidate = index + 1; candidate < moves.length; candidate++) {
      if (this.orderScores[base + candidate] > this.orderScores[base + bestIndex]) bestIndex = candidate;
    }
    const move = moves[bestIndex];
    if (bestIndex !== index) {
      moves[bestIndex] = moves[index];
      moves[index] = move;
      const score = this.orderScores[base + bestIndex];
      this.orderScores[base + bestIndex] = this.orderScores[base + index];
      this.orderScores[base + index] = score;
    }
    return move;
  }

  private isKiller(move: Move, ply: number): boolean {
    return move === this.killers[ply * 2] || move === this.killers[ply * 2 + 1];
  }

  private rewardQuietCutoff(move: Move, depth: number, ply: number): void {
    if (this.killers[ply * 2] !== move) {
      this.killers[ply * 2 + 1] = this.killers[ply * 2];
      this.killers[ply * 2] = move;
    }
    // Called after the move is unmade, so the moving piece is back on its from-square.
    const slot = this.position.board[moveFrom(move)] * 128 + moveTo(move);
    this.history[slot] += depth * depth;
    if (this.history[slot] >= HISTORY_LIMIT) {
      for (let index = 0; index < this.history.length; index++) this.history[index] >>= 1;
    }
  }
}
