import { PIECE_VALUES, evaluate, evaluateMaterial } from "./eval";
import type { Game } from "./game";
import { type Move, NO_MOVE, moveCaptured, movePiece, movePromotion, moveTo, moveToUci } from "./move";
import { Position } from "./position";
import type { Difficulty } from "./protocol";
import { type Color, typeOf } from "./types";

export interface SearchOptions {
  difficulty: Difficulty;
  /** Override the level's time budget, mainly for tests. */
  maxTimeMs?: number;
  /** Source of randomness for the easy level. */
  random?: () => number;
}

export interface SearchResult {
  move: Move | null;
  uci: string | null;
  depth: number;
  score: number;
  nodes: number;
  timeMs: number;
}

export const MATE = 100000;
const MATE_BOUND = MATE - 1000;
const INFINITY = MATE + 1;
const MAX_PLY = 64;
const HARD_TIME_CAP_MS = 4000;
const NODES_PER_CLOCK_CHECK = 2048;
const EASY_NOISE_MARGIN = 150;

interface LevelProfile {
  maxDepth: number;
  timeMs: number;
  /** Extend the search by one ply when the side to move is in check. */
  checkExtension: boolean;
}

const PROFILES: Record<Exclude<Difficulty, "easy">, LevelProfile> = {
  medium: { maxDepth: 2, timeMs: HARD_TIME_CAP_MS, checkExtension: false },
  hard: { maxDepth: 5, timeMs: 1500, checkExtension: false },
  expert: { maxDepth: 8, timeMs: 3500, checkExtension: true },
};

const TT_EXACT = 0;
const TT_LOWER = 1;
const TT_UPPER = 2;

interface TTEntry {
  depth: number;
  score: number;
  flag: number;
  move: Move;
}

class SearchAborted extends Error {}

/** Position hashes of the game so far, without the current position. */
const historyHashes = (game: Game): number[] => {
  const pos = Position.fromFen(game.startFen);
  const hashes = [pos.hash];
  for (const move of game.moveHistory()) {
    pos.makeMove(move);
    hashes.push(pos.hash);
  }
  hashes.pop();
  return hashes;
};

const kingIsSafe = (pos: Position, mover: Color): boolean =>
  !pos.isSquareAttacked(pos.kingOf(mover), (mover ^ 1) as Color);

class Searcher {
  private readonly pos: Position;
  private readonly profile: LevelProfile;
  private readonly deadline: number;
  private readonly startedAt: number;
  private readonly tt = new Map<number, TTEntry>();
  private readonly killers = new Int32Array(MAX_PLY * 2);
  private readonly history = new Int32Array(16 * 128);
  private readonly pathHashes = new Float64Array(MAX_PLY + 1);
  private readonly gameHashes: Set<number>;
  nodes = 0;

  constructor(pos: Position, gameHashes: number[], profile: LevelProfile, timeMs: number) {
    this.pos = pos;
    this.profile = profile;
    this.gameHashes = new Set(gameHashes);
    this.startedAt = performance.now();
    this.deadline = this.startedAt + timeMs;
  }

  /** Iterative deepening; returns the best move of the last completed iteration. */
  run(rootMoves: Move[]): { move: Move; depth: number; score: number } {
    let bestMove = rootMoves[0] as Move;
    let bestScore = 0;
    let completedDepth = 0;
    for (let depth = 1; depth <= this.profile.maxDepth; depth++) {
      try {
        const iteration = this.searchRoot(rootMoves, depth, bestMove);
        bestMove = iteration.move;
        bestScore = iteration.score;
        completedDepth = depth;
      } catch (error) {
        if (error instanceof SearchAborted) break;
        throw error;
      }
      if (Math.abs(bestScore) >= MATE_BOUND) break;
      // Do not start an iteration that is unlikely to finish in time.
      const elapsed = performance.now() - this.startedAt;
      if (elapsed * 2 > this.deadline - this.startedAt) break;
    }
    return { move: bestMove, depth: completedDepth, score: bestScore };
  }

  private searchRoot(rootMoves: Move[], depth: number, previousBest: Move): { move: Move; score: number } {
    const pos = this.pos;
    this.pathHashes[0] = pos.hash;
    const ordered = this.orderMoves(rootMoves, previousBest, 0);
    let alpha = -INFINITY;
    let bestMove = ordered[0] as Move;
    for (const move of ordered) {
      const undo = pos.makeMove(move);
      let score: number;
      try {
        score = -this.negamax(depth - 1, -INFINITY, -alpha, 1);
      } finally {
        pos.unmakeMove(move, undo);
      }
      if (score > alpha) {
        alpha = score;
        bestMove = move;
      }
    }
    return { move: bestMove, score: alpha };
  }

  private negamax(depth: number, alpha: number, beta: number, ply: number): number {
    this.tick();
    const pos = this.pos;
    this.pathHashes[ply] = pos.hash;
    if (this.isDrawByRepetitionOrClock(ply)) return 0;

    const inCheck = pos.inCheck();
    if (inCheck && this.profile.checkExtension && ply < MAX_PLY - 1) depth++;
    if (depth <= 0) return this.quiescence(alpha, beta, ply);

    const originalAlpha = alpha;
    const entry = this.tt.get(pos.hash);
    let ttMove = NO_MOVE;
    if (entry) {
      ttMove = entry.move;
      if (entry.depth >= depth) {
        const score = fromTT(entry.score, ply);
        if (entry.flag === TT_EXACT) return score;
        if (entry.flag === TT_LOWER && score > alpha) alpha = score;
        else if (entry.flag === TT_UPPER && score < beta) beta = score;
        if (alpha >= beta) return score;
      }
    }

    const moves = this.orderMoves(pos.pseudoLegalMoves(), ttMove, ply);
    const mover = pos.sideToMove;
    let bestScore = -INFINITY;
    let bestMove = NO_MOVE;
    let legalCount = 0;
    for (const move of moves) {
      const undo = pos.makeMove(move);
      if (!kingIsSafe(pos, mover)) {
        pos.unmakeMove(move, undo);
        continue;
      }
      legalCount++;
      let score: number;
      try {
        score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
      } finally {
        pos.unmakeMove(move, undo);
      }
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      if (score > alpha) {
        alpha = score;
        if (alpha >= beta) {
          if (!moveCaptured(move)) this.rememberQuietCutoff(move, ply, depth);
          break;
        }
      }
    }

    if (legalCount === 0) return inCheck ? -(MATE - ply) : 0;

    const flag = bestScore <= originalAlpha ? TT_UPPER : bestScore >= beta ? TT_LOWER : TT_EXACT;
    this.tt.set(pos.hash, { depth, score: toTT(bestScore, ply), flag, move: bestMove });
    return bestScore;
  }

  private quiescence(alpha: number, beta: number, ply: number): number {
    this.tick();
    const pos = this.pos;
    const standPat = evaluate(pos);
    if (standPat >= beta) return standPat;
    if (standPat > alpha) alpha = standPat;
    if (ply >= MAX_PLY - 1) return standPat;

    const captures = pos.pseudoLegalMoves().filter((move) => moveCaptured(move) || movePromotion(move));
    const ordered = this.orderMoves(captures, NO_MOVE, ply);
    const mover = pos.sideToMove;
    let best = standPat;
    for (const move of ordered) {
      const undo = pos.makeMove(move);
      if (!kingIsSafe(pos, mover)) {
        pos.unmakeMove(move, undo);
        continue;
      }
      let score: number;
      try {
        score = -this.quiescence(-beta, -alpha, ply + 1);
      } finally {
        pos.unmakeMove(move, undo);
      }
      if (score > best) best = score;
      if (score > alpha) {
        alpha = score;
        if (alpha >= beta) break;
      }
    }
    return best;
  }

  private isDrawByRepetitionOrClock(ply: number): boolean {
    if (ply === 0) return false;
    const pos = this.pos;
    if (pos.halfmoveClock >= 100) return true;
    const hash = pos.hash;
    if (this.gameHashes.has(hash)) return true;
    for (let i = ply - 1; i >= 0; i--) {
      if (this.pathHashes[i] === hash) return true;
    }
    return false;
  }

  private orderMoves(moves: Move[], ttMove: Move, ply: number): Move[] {
    const scored = moves.map((move) => ({ move, key: this.orderingKey(move, ttMove, ply) }));
    scored.sort((a, b) => b.key - a.key);
    return scored.map((item) => item.move);
  }

  private orderingKey(move: Move, ttMove: Move, ply: number): number {
    if (move === ttMove) return 1_000_000;
    const captured = moveCaptured(move);
    const promotion = movePromotion(move);
    if (captured || promotion) {
      const victim = captured ? (PIECE_VALUES[typeOf(captured)] as number) : 0;
      const attacker = PIECE_VALUES[typeOf(movePiece(move))] as number;
      const promotionBonus = promotion ? (PIECE_VALUES[promotion] as number) : 0;
      return 100_000 + victim * 10 - Math.floor(attacker / 100) + promotionBonus;
    }
    if (this.killers[ply * 2] === move) return 90_000;
    if (this.killers[ply * 2 + 1] === move) return 80_000;
    return this.history[(movePiece(move) << 7) + moveTo(move)] as number;
  }

  private rememberQuietCutoff(move: Move, ply: number, depth: number): void {
    if (this.killers[ply * 2] !== move) {
      this.killers[ply * 2 + 1] = this.killers[ply * 2] as number;
      this.killers[ply * 2] = move;
    }
    const index = (movePiece(move) << 7) + moveTo(move);
    this.history[index] = Math.min((this.history[index] as number) + depth * depth, 50_000);
  }

  private tick(): void {
    this.nodes++;
    if (this.nodes % NODES_PER_CLOCK_CHECK === 0 && performance.now() >= this.deadline) {
      throw new SearchAborted();
    }
  }
}

// Mate scores are stored relative to the root so they stay valid at any ply.
const toTT = (score: number, ply: number): number => {
  if (score >= MATE_BOUND) return score + ply;
  if (score <= -MATE_BOUND) return score - ply;
  return score;
};

const fromTT = (score: number, ply: number): number => {
  if (score >= MATE_BOUND) return score - ply;
  if (score <= -MATE_BOUND) return score + ply;
  return score;
};

/** True when the opponent, now to move, can deliver checkmate immediately. */
const opponentMatesInOne = (pos: Position): boolean => {
  for (const reply of pos.legalMoves()) {
    const undo = pos.makeMove(reply);
    const mated = pos.inCheck() && pos.legalMoves().length === 0;
    pos.unmakeMove(reply, undo);
    if (mated) return true;
  }
  return false;
};

/**
 * Easy: material after one ply, refusing to walk into mate in one, then a
 * random pick among moves within a wide margin of the best.
 */
const searchEasy = (pos: Position, rootMoves: Move[], random: () => number): { move: Move; score: number; nodes: number } => {
  let nodes = 0;
  const scored = rootMoves.map((move) => {
    const undo = pos.makeMove(move);
    nodes++;
    let score: number;
    if (pos.inCheck() && pos.legalMoves().length === 0) {
      score = MATE;
    } else if (opponentMatesInOne(pos)) {
      score = -MATE;
    } else {
      score = -evaluateMaterial(pos);
    }
    pos.unmakeMove(move, undo);
    return { move, score };
  });
  const best = Math.max(...scored.map((item) => item.score));
  const candidates = scored.filter((item) => item.score >= best - EASY_NOISE_MARGIN);
  const pick = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))] as {
    move: Move;
    score: number;
  };
  return { move: pick.move, score: pick.score, nodes };
};

export const findBestMove = (game: Game, options: SearchOptions): SearchResult => {
  const started = performance.now();
  const rootMoves = game.legalMoves();
  const finish = (move: Move | null, depth: number, score: number, nodes: number): SearchResult => ({
    move,
    uci: move === null ? null : moveToUci(move),
    depth,
    score,
    nodes,
    timeMs: Math.round(performance.now() - started),
  });
  if (rootMoves.length === 0) return finish(null, 0, 0, 0);

  const pos = game.position.clone();

  if (options.difficulty === "easy") {
    const result = searchEasy(pos, rootMoves, options.random ?? Math.random);
    return finish(result.move, 1, result.score, result.nodes);
  }

  const profile = PROFILES[options.difficulty];
  const timeMs = Math.min(options.maxTimeMs ?? profile.timeMs, HARD_TIME_CAP_MS);
  const searcher = new Searcher(pos, historyHashes(game), profile, timeMs);
  const result = searcher.run(rootMoves);
  return finish(result.move, result.depth, result.score, searcher.nodes);
};
