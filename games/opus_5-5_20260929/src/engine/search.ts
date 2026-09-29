import { hasInsufficientMaterial } from "../core/game";
import {
  FLAG_CAPTURE,
  FLAG_EN_PASSANT,
  PAWN,
  Position,
  moveFlags,
  moveFrom,
  movePromotion,
  moveTo,
  moveToUci,
} from "../core/position";
import { Difficulty } from "./difficulty";
import { PIECE_VALUE, evaluate, hasNonPawnMaterial } from "./evaluate";

export interface SearchRequest {
  startFen: string;
  /** UCI moves played from `startFen`, replayed so repetition history is known. */
  moves: string[];
  difficulty: Difficulty;
  /** Seed for evaluation noise. Defaults to the wall clock. */
  seed?: number;
}

export interface SearchResult {
  move: string;
  /** Deepest fully completed iteration (0 when the move was forced). */
  depth: number;
  /** Centipawns from the side to move's perspective; mates are near +-MATE_SCORE. */
  score: number;
  nodes: number;
  timeMs: number;
}

export interface DifficultySettings {
  /** Iterative deepening stops at this depth. */
  maxDepth: number;
  /** Largest absolute centipawn noise added to each leaf evaluation. */
  noise: number;
  /** Maximum capture plies explored by quiescence search. */
  quiescenceDepth: number;
  /** No new iteration starts after this much time has elapsed. */
  softTimeMs: number;
  /** The search aborts at this point and falls back to the last completed iteration. */
  hardTimeMs: number;
}

/** Strength settings per level. Budgets leave room for worker start-up inside a 5 second reply window. */
export const DIFFICULTY_SETTINGS: Readonly<Record<Difficulty, DifficultySettings>> = {
  easy: { maxDepth: 1, noise: 150, quiescenceDepth: 3, softTimeMs: 300, hardTimeMs: 400 },
  medium: { maxDepth: 4, noise: 25, quiescenceDepth: 8, softTimeMs: 500, hardTimeMs: 800 },
  hard: { maxDepth: 8, noise: 0, quiescenceDepth: 16, softTimeMs: 1200, hardTimeMs: 2000 },
  expert: { maxDepth: 64, noise: 0, quiescenceDepth: 32, softTimeMs: 1900, hardTimeMs: 3500 },
};

/** Score of delivering mate at the root; a mate found `n` plies deep scores MATE_SCORE - n. */
export const MATE_SCORE = 30000;
const MATE_BOUND = MATE_SCORE - 1000;
const INFINITY = 32000;
const MAX_PLY = 128;
const MAX_MOVES = 256;

const TT_BITS = 20;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const BOUND_EXACT = 1;
const BOUND_LOWER = 2;
const BOUND_UPPER = 3;

const ORDER_TT_MOVE = 4_000_000;
const ORDER_CAPTURE = 2_000_000;
const ORDER_KILLER_FIRST = 1_500_000;
const ORDER_KILLER_SECOND = 1_400_000;
const HISTORY_LIMIT = 1_000_000;

const NODE_CHECK_MASK = 1023;
const DELTA_MARGIN = 200;
const REVERSE_FUTILITY_MARGIN = 110;

interface TranspositionTable {
  keyLo: Int32Array;
  keyHi: Int32Array;
  move: Int32Array;
  score: Int32Array;
  depth: Int8Array;
  bound: Uint8Array;
}

let sharedTable: TranspositionTable | null = null;

/** One table per thread, allocated lazily because it is about 18 MB. */
const transpositionTable = (): TranspositionTable => {
  sharedTable ??= {
    keyLo: new Int32Array(TT_SIZE),
    keyHi: new Int32Array(TT_SIZE),
    move: new Int32Array(TT_SIZE),
    score: new Int32Array(TT_SIZE),
    depth: new Int8Array(TT_SIZE),
    bound: new Uint8Array(TT_SIZE),
  };
  return sharedTable;
};

/** Mate scores are stored relative to the node so they stay correct when reached at another ply. */
const scoreToTable = (score: number, ply: number): number =>
  score >= MATE_BOUND ? score + ply : score <= -MATE_BOUND ? score - ply : score;

const scoreFromTable = (score: number, ply: number): number =>
  score >= MATE_BOUND ? score - ply : score <= -MATE_BOUND ? score + ply : score;

const isCapture = (move: number): boolean => (moveFlags(move) & FLAG_CAPTURE) !== 0;

const victimValue = (board: Int8Array, move: number): number =>
  moveFlags(move) & FLAG_EN_PASSANT ? PIECE_VALUE[PAWN] : PIECE_VALUE[board[moveTo(move)] & 7];

/** Moves the highest-scored remaining move to `index` so ordering costs nothing for pruned tails. */
const pickNext = (moves: number[], scores: Int32Array, index: number): number => {
  let best = index;
  for (let candidate = index + 1; candidate < moves.length; candidate++) {
    if (scores[candidate] > scores[best]) best = candidate;
  }
  if (best !== index) {
    const move = moves[best];
    moves[best] = moves[index];
    moves[index] = move;
    const score = scores[best];
    scores[best] = scores[index];
    scores[index] = score;
  }
  return moves[index];
};

/** Finalises a 32-bit hash so nearby positions get unrelated noise. */
const mixBits = (value: number): number => {
  let mixed = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  mixed = Math.imul(mixed ^ (mixed >>> 13), 0xc2b2ae35);
  return (mixed ^ (mixed >>> 16)) >>> 0;
};

class Searcher {
  nodes = 0;
  stopped = false;
  private readonly table = transpositionTable();
  private readonly killers = new Int32Array(MAX_PLY * 2);
  private readonly history = new Int32Array(16 * 128);
  private readonly moveLists: number[][] = Array.from({ length: MAX_PLY }, (): number[] => []);
  private readonly scoreLists: Int32Array[] = Array.from({ length: MAX_PLY }, (): Int32Array => new Int32Array(MAX_MOVES));
  private readonly rootScores = new Int32Array(MAX_MOVES);
  private readonly seedMix: number;
  /** Material only shrinks, so a root with insufficient material makes every node a draw. */
  private readonly drawnByMaterial: boolean;
  partialMove = 0;
  partialScore = -INFINITY;

  constructor(
    private readonly position: Position,
    private readonly settings: DifficultySettings,
    private readonly now: () => number,
    private readonly startTime: number,
    seed: number,
  ) {
    this.table.bound.fill(0);
    this.seedMix = mixBits(seed | 0);
    this.drawnByMaterial = hasInsufficientMaterial(position);
  }

  /**
   * Searches every root move to `depth`, reordering `rootMoves` best first. Returns false when the
   * clock ran out; `partialMove` then holds the best move among those fully searched, if any.
   */
  searchRoot(rootMoves: number[], depth: number): boolean {
    const position = this.position;
    let alpha = -INFINITY;
    const beta = INFINITY;
    this.partialMove = 0;
    this.partialScore = -INFINITY;
    for (let index = 0; index < rootMoves.length; index++) {
      const move = rootMoves[index];
      position.makeMove(move);
      let score: number;
      if (index === 0) {
        score = -this.negamax(depth - 1, -beta, -alpha, 1, true);
      } else {
        score = -this.negamax(depth - 1, -alpha - 1, -alpha, 1, true);
        if (score > alpha && !this.stopped) score = -this.negamax(depth - 1, -beta, -alpha, 1, true);
      }
      position.unmakeMove();
      if (this.stopped) return false;
      this.rootScores[index] = score;
      if (score > alpha) {
        alpha = score;
        this.partialMove = move;
        this.partialScore = score;
      }
    }
    this.orderRootMoves(rootMoves);
    return true;
  }

  private orderRootMoves(rootMoves: number[]): void {
    const scored = rootMoves.map((move, index): { move: number; score: number } => ({
      move,
      score: move === this.partialMove ? INFINITY : this.rootScores[index],
    }));
    scored.sort((first, second): number => second.score - first.score);
    scored.forEach((entry, index): void => {
      rootMoves[index] = entry.move;
    });
  }

  private tick(): void {
    this.nodes += 1;
    if ((this.nodes & NODE_CHECK_MASK) === 0 && this.now() - this.startTime >= this.settings.hardTimeMs) {
      this.stopped = true;
    }
  }

  private evaluateLeaf(): number {
    const score = evaluate(this.position);
    const noise = this.settings.noise;
    if (noise === 0) return score;
    // Hash-derived noise is stable for a position within one search, so the TT stays consistent.
    const position = this.position;
    const bits = mixBits(position.hashLo ^ this.seedMix ^ Math.imul(position.hashHi, 0x9e3779b1));
    return score + (bits % (2 * noise + 1)) - noise;
  }

  private negamax(depth: number, alphaIn: number, betaIn: number, ply: number, allowNull: boolean): number {
    if (this.stopped) return 0;
    const position = this.position;
    if (
      position.halfmoveClock >= 100 ||
      position.repetitionCount() >= 1 ||
      this.drawnByMaterial ||
      (position.halfmoveClock === 0 && hasInsufficientMaterial(position))
    ) {
      return 0;
    }
    let alpha = Math.max(alphaIn, -MATE_SCORE + ply);
    const beta = Math.min(betaIn, MATE_SCORE - ply - 1);
    if (alpha >= beta) return alpha;

    const inCheck = position.inCheck();
    const searchDepth = inCheck ? depth + 1 : depth;
    if (searchDepth <= 0) return this.quiescence(alpha, beta, ply, 0);
    this.tick();
    if (ply >= MAX_PLY - 1) return this.evaluateLeaf();

    const pvNode = beta - alpha > 1;
    const table = this.table;
    const slot = position.hashLo & TT_MASK;
    let ttMove = 0;
    if (table.bound[slot] !== 0 && table.keyLo[slot] === position.hashLo && table.keyHi[slot] === position.hashHi) {
      ttMove = table.move[slot];
      if (!pvNode && table.depth[slot] >= searchDepth) {
        const stored = scoreFromTable(table.score[slot], ply);
        const bound = table.bound[slot];
        if (
          bound === BOUND_EXACT ||
          (bound === BOUND_LOWER && stored >= beta) ||
          (bound === BOUND_UPPER && stored <= alpha)
        ) {
          return stored;
        }
      }
    }

    if (!pvNode && !inCheck) {
      const staticEval = this.evaluateLeaf();
      if (searchDepth <= 3 && Math.abs(beta) < MATE_BOUND && staticEval - REVERSE_FUTILITY_MARGIN * searchDepth >= beta) {
        return staticEval;
      }
      if (allowNull && searchDepth >= 3 && staticEval >= beta && hasNonPawnMaterial(position)) {
        const reduction = searchDepth >= 7 ? 3 : 2;
        position.makeNullMove();
        const score = -this.negamax(searchDepth - 1 - reduction, -beta, -beta + 1, ply + 1, false);
        position.unmakeMove();
        if (this.stopped) return 0;
        if (score >= beta) return score >= MATE_BOUND ? beta : score;
      }
    }

    const moves = this.moveLists[ply];
    moves.length = 0;
    position.generateMoves(moves);
    const scores = this.scoreLists[ply];
    this.scoreMoves(moves, scores, ttMove, ply);

    let bestScore = -INFINITY;
    let bestMove = 0;
    let legalCount = 0;
    for (let index = 0; index < moves.length; index++) {
      const move = pickNext(moves, scores, index);
      position.makeMove(move);
      if (position.movedSideInCheck()) {
        position.unmakeMove();
        continue;
      }
      legalCount += 1;
      const quiet = !isCapture(move) && movePromotion(move) === 0;
      let score: number;
      if (legalCount === 1) {
        score = -this.negamax(searchDepth - 1, -beta, -alpha, ply + 1, true);
      } else {
        const reduction =
          searchDepth >= 3 && legalCount > 3 && quiet && !inCheck && scores[index] < ORDER_KILLER_SECOND && !position.inCheck()
            ? legalCount > 8
              ? 2
              : 1
            : 0;
        score = -this.negamax(searchDepth - 1 - reduction, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && reduction > 0) score = -this.negamax(searchDepth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && score < beta) score = -this.negamax(searchDepth - 1, -beta, -alpha, ply + 1, true);
      }
      position.unmakeMove();
      if (this.stopped) return 0;
      if (score <= bestScore) continue;
      bestScore = score;
      bestMove = move;
      if (score <= alpha) continue;
      alpha = score;
      if (alpha >= beta) {
        if (quiet) this.rewardQuietCutoff(move, ply, searchDepth);
        break;
      }
    }

    if (legalCount === 0) return inCheck ? -MATE_SCORE + ply : 0;

    table.keyLo[slot] = position.hashLo;
    table.keyHi[slot] = position.hashHi;
    table.move[slot] = bestMove;
    table.score[slot] = scoreToTable(bestScore, ply);
    table.depth[slot] = searchDepth;
    table.bound[slot] = bestScore >= beta ? BOUND_LOWER : bestScore > alphaIn ? BOUND_EXACT : BOUND_UPPER;
    return bestScore;
  }

  private quiescence(alphaIn: number, beta: number, ply: number, captureDepth: number): number {
    if (this.stopped) return 0;
    this.tick();
    const standPat = this.evaluateLeaf();
    if (standPat >= beta) return standPat;
    if (ply >= MAX_PLY - 1 || captureDepth >= this.settings.quiescenceDepth) return standPat;
    let alpha = Math.max(alphaIn, standPat);

    const position = this.position;
    const board = position.board;
    const moves = this.moveLists[ply];
    moves.length = 0;
    position.generateMoves(moves, true);
    const scores = this.scoreLists[ply];
    for (let index = 0; index < moves.length; index++) {
      const move = moves[index];
      scores[index] = victimValue(board, move) * 16 - (board[moveFrom(move)] & 7) + PIECE_VALUE[movePromotion(move)];
    }

    let bestScore = standPat;
    for (let index = 0; index < moves.length; index++) {
      const move = pickNext(moves, scores, index);
      // Delta pruning: even winning this piece outright cannot lift the score to alpha.
      if (movePromotion(move) === 0 && standPat + victimValue(board, move) + DELTA_MARGIN <= alpha) continue;
      position.makeMove(move);
      if (position.movedSideInCheck()) {
        position.unmakeMove();
        continue;
      }
      const score = -this.quiescence(-beta, -alpha, ply + 1, captureDepth + 1);
      position.unmakeMove();
      if (this.stopped) return 0;
      if (score <= bestScore) continue;
      bestScore = score;
      if (score <= alpha) continue;
      alpha = score;
      if (alpha >= beta) break;
    }
    return bestScore;
  }

  private scoreMoves(moves: number[], scores: Int32Array, ttMove: number, ply: number): void {
    const board = this.position.board;
    const firstKiller = this.killers[ply * 2];
    const secondKiller = this.killers[ply * 2 + 1];
    for (let index = 0; index < moves.length; index++) {
      const move = moves[index];
      const promotion = movePromotion(move);
      if (move === ttMove) scores[index] = ORDER_TT_MOVE;
      else if (isCapture(move) || promotion) {
        const victim = isCapture(move) ? victimValue(board, move) : 0;
        scores[index] = ORDER_CAPTURE + victim * 16 - (board[moveFrom(move)] & 7) + PIECE_VALUE[promotion];
      } else if (move === firstKiller) scores[index] = ORDER_KILLER_FIRST;
      else if (move === secondKiller) scores[index] = ORDER_KILLER_SECOND;
      else scores[index] = this.history[board[moveFrom(move)] * 128 + moveTo(move)];
    }
  }

  private rewardQuietCutoff(move: number, ply: number, depth: number): void {
    if (this.killers[ply * 2] !== move) {
      this.killers[ply * 2 + 1] = this.killers[ply * 2];
      this.killers[ply * 2] = move;
    }
    // The move has been unmade, so the moving piece is back on its origin square.
    const index = this.position.board[moveFrom(move)] * 128 + moveTo(move);
    this.history[index] += depth * depth;
    if (this.history[index] > HISTORY_LIMIT) {
      for (let entry = 0; entry < this.history.length; entry++) this.history[entry] >>= 1;
    }
  }
}

const replay = (request: SearchRequest): Position => {
  const position = Position.fromFen(request.startFen);
  for (const uci of request.moves) {
    const move = position.parseUci(uci);
    if (move === null) throw new Error(`Illegal move in history: ${uci}`);
    position.makeMove(move);
  }
  return position;
};

const defaultNow = (): number => performance.now();

/**
 * Picks a move for the side to move after replaying `request.moves` from `request.startFen`.
 * Always returns a legal move; throws only when there is none (or the history is invalid).
 * `now` is injectable so tests can run the time control on an accelerated clock.
 */
export const findBestMove = (request: SearchRequest, now: () => number = defaultNow): SearchResult => {
  const startTime = now();
  const settings = DIFFICULTY_SETTINGS[request.difficulty];
  const position = replay(request);
  const rootMoves = position.legalMoves();
  if (rootMoves.length === 0) throw new Error("No legal moves in this position");
  if (rootMoves.length === 1) {
    return { move: moveToUci(rootMoves[0]), depth: 0, score: evaluate(position), nodes: 0, timeMs: now() - startTime };
  }

  const searcher = new Searcher(position, settings, now, startTime, request.seed ?? Date.now());
  let bestMove = rootMoves[0];
  let bestScore = evaluate(position);
  let completedDepth = 0;
  for (let depth = 1; depth <= settings.maxDepth; depth++) {
    const complete = searcher.searchRoot(rootMoves, depth);
    // Root moves are searched best-first, so a partially searched iteration can only replace
    // the previous choice with a move that was proven better at the new depth.
    if (searcher.partialMove !== 0) {
      bestMove = searcher.partialMove;
      bestScore = searcher.partialScore;
    }
    if (!complete) break;
    completedDepth = depth;
    if (now() - startTime >= settings.softTimeMs) break;
    if (Math.abs(bestScore) >= MATE_BOUND && depth >= MATE_SCORE - Math.abs(bestScore)) break;
  }

  return {
    move: moveToUci(bestMove),
    depth: completedDepth,
    // Negating a zero draw score yields -0, which callers comparing with Object.is would reject.
    score: bestScore === 0 ? 0 : bestScore,
    nodes: searcher.nodes,
    timeMs: now() - startTime,
  };
};
