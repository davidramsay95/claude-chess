import type { Move, Difficulty } from "../chess/types.js";
import {
  PAWN, KING,
  FLAG_CAPTURE,
  pieceType, pieceColor,
  type Color,
} from "../chess/types.js";
import { ChessGame } from "../chess/game.js";
import { updateHashTurn, updateHashEp } from "../chess/board.js";
import { evaluate, evaluateMaterial } from "./evaluate.js";

export interface SearchResult {
  bestMove: Move;
  score: number;
  depth: number;
  nodes: number;
}

const MATE = 100000;
const MATE_THRESHOLD = MATE - 200;
const INF = MATE + 1;

const MVV_LVA = [0, 1, 3, 3, 5, 9, 0];
const DELTA_MAT = [0, 100, 320, 330, 500, 900, 20000];

const TT_SIZE = 1 << 18;
const TT_MASK = TT_SIZE - 1;
const TT_EXACT = 0;
const TT_ALPHA = 1;
const TT_BETA = 2;
const TT_NONE = 3;

const ttHash = new Uint32Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttFlag = new Uint8Array(TT_SIZE);
const ttScore = new Int16Array(TT_SIZE);
const ttMoveFrom = new Uint8Array(TT_SIZE);
const ttMoveTo = new Uint8Array(TT_SIZE);
const ttMovePromo = new Uint8Array(TT_SIZE);
ttFlag.fill(TT_NONE);

function scoreToTT(score: number, ply: number): number {
  if (score > MATE_THRESHOLD) return score + ply;
  if (score < -MATE_THRESHOLD) return score - ply;
  return score;
}

function scoreFromTT(score: number, ply: number): number {
  if (score > MATE_THRESHOLD) return score - ply;
  if (score < -MATE_THRESHOLD) return score + ply;
  return score;
}

function ttStore(hash: number, depth: number, score: number, flag: number, move: Move | null, ply: number): void {
  const idx = hash & TT_MASK;
  ttHash[idx] = hash;
  ttDepth[idx] = depth;
  ttFlag[idx] = flag;
  ttScore[idx] = scoreToTT(score, ply);
  if (move) {
    ttMoveFrom[idx] = move.from;
    ttMoveTo[idx] = move.to;
    ttMovePromo[idx] = move.promotion;
  }
}

const MAX_PLY = 64;
const killerFrom = new Uint8Array(MAX_PLY * 2);
const killerTo = new Uint8Array(MAX_PLY * 2);
const history = new Int32Array(15 * 128);

function clearTables(): void {
  killerFrom.fill(0);
  killerTo.fill(0);
  history.fill(0);
}

function storeKiller(move: Move, ply: number): void {
  if (move.flags & FLAG_CAPTURE) return;
  const base = ply * 2;
  if (killerFrom[base] === move.from && killerTo[base] === move.to) return;
  killerFrom[base + 1] = killerFrom[base];
  killerTo[base + 1] = killerTo[base];
  killerFrom[base] = move.from;
  killerTo[base] = move.to;
}

function isKiller(move: Move, ply: number): boolean {
  const base = ply * 2;
  return (killerFrom[base] === move.from && killerTo[base] === move.to) ||
         (killerFrom[base + 1] === move.from && killerTo[base + 1] === move.to);
}

function histIdx(piece: number, to: number): number {
  return piece * 128 + to;
}

function scoreMove(
  m: Move,
  ply: number,
  hashFrom: number,
  hashTo: number,
  hashPromo: number,
): number {
  if (m.from === hashFrom && m.to === hashTo && m.promotion === hashPromo) {
    return 10_000_000;
  }
  if (m.flags & FLAG_CAPTURE) {
    return 1_000_000 + MVV_LVA[pieceType(m.captured)] * 10 - MVV_LVA[pieceType(m.piece)];
  }
  if (isKiller(m, ply)) return 900_000;
  return history[histIdx(m.piece, m.to)];
}

function pickBest(moves: Move[], scores: number[], start: number): void {
  let best = start;
  for (let j = start + 1; j < moves.length; j++) {
    if (scores[j] > scores[best]) best = j;
  }
  if (best !== start) {
    const tm = moves[start]; moves[start] = moves[best]; moves[best] = tm;
    const ts = scores[start]; scores[start] = scores[best]; scores[best] = ts;
  }
}

interface SearchConfig {
  maxDepth: number;
  timeLimit: number;
  fullEval: boolean;
  noise: number;
  maxQDepth: number;
  nullMove: boolean;
  lmr: boolean;
  useTT: boolean;
}

const CONFIGS: Record<Difficulty, SearchConfig> = {
  easy:   { maxDepth: 2, timeLimit: 500,  fullEval: false, noise: 50, maxQDepth: 0,  nullMove: false, lmr: false, useTT: false },
  medium: { maxDepth: 3, timeLimit: 1500, fullEval: true,  noise: 10, maxQDepth: 3,  nullMove: false, lmr: false, useTT: true },
  hard:   { maxDepth: 5, timeLimit: 3000, fullEval: true,  noise: 0,  maxQDepth: 50, nullMove: true,  lmr: false, useTT: true },
  expert: { maxDepth: 7, timeLimit: 4500, fullEval: true,  noise: 0,  maxQDepth: 50, nullMove: true,  lmr: true,  useTT: true },
};

let nodes = 0;
let startTime = 0;
let timeLimit = 0;
let aborted = false;
let cfg: SearchConfig;

function checkTime(): boolean {
  if (aborted) return true;
  if ((nodes & 4095) === 0 && performance.now() - startTime >= timeLimit) {
    aborted = true;
  }
  return aborted;
}

function evalPos(game: ChessGame): number {
  return cfg.fullEval ? evaluate(game) : evaluateMaterial(game);
}

function hasNonPawnMaterial(board: Uint8Array, color: Color): boolean {
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const p = board[sq];
    if (!p) continue;
    if (pieceColor(p) !== color) continue;
    const pt = pieceType(p);
    if (pt !== PAWN && pt !== KING) return true;
  }
  return false;
}

interface NullUndo { epSquare: number; hash: number }

function makeNull(game: ChessGame): NullUndo {
  const saved: NullUndo = { epSquare: game.state.epSquare, hash: game.hash };
  let h = game.hash;
  h = updateHashEp(h, game.state.epSquare, -1);
  h = updateHashTurn(h);
  game.state.epSquare = -1;
  game.state.turn = (1 - game.state.turn) as Color;
  game.hash = h;
  game.legalMoves = null;
  return saved;
}

function unmakeNull(game: ChessGame, saved: NullUndo): void {
  game.state.turn = (1 - game.state.turn) as Color;
  game.state.epSquare = saved.epSquare;
  game.hash = saved.hash;
  game.legalMoves = null;
}

function quiescence(
  game: ChessGame,
  alpha: number,
  beta: number,
  qDepth: number,
  ply: number,
): number {
  nodes++;
  if (checkTime()) return 0;

  const inCheck = game.isCheck();
  let standPat = -INF;

  if (!inCheck) {
    standPat = evalPos(game);
    if (standPat >= beta) return beta;
    if (standPat + 1100 < alpha) return alpha;
    if (standPat > alpha) alpha = standPat;
  }

  if (!inCheck && qDepth <= -cfg.maxQDepth) return standPat;

  const moves = game.getLegalMoves();
  if (moves.length === 0) {
    return inCheck ? (-MATE + ply) : 0;
  }

  const scores = moves.map(m => {
    if (m.flags & FLAG_CAPTURE) return MVV_LVA[pieceType(m.captured)] * 10 - MVV_LVA[pieceType(m.piece)] + 1000;
    if (m.promotion) return 500;
    return 0;
  });

  for (let i = 0; i < moves.length; i++) {
    pickBest(moves, scores, i);
    const m = moves[i];
    const isCapture = (m.flags & FLAG_CAPTURE) !== 0;
    const isPromotion = m.promotion !== 0;

    if (inCheck) {
      // search all evasions
    } else if (isCapture || isPromotion) {
      if (isCapture) {
        const delta = standPat + DELTA_MAT[pieceType(m.captured)] + 200;
        if (delta < alpha) continue;
      }
    } else if (qDepth === 0) {
      game.makeMove(m);
      const givesCheck = game.isCheck();
      if (!givesCheck) {
        game.unmakeMove();
        continue;
      }
      const score = -quiescence(game, -beta, -alpha, qDepth - 1, ply + 1);
      game.unmakeMove();
      if (aborted) return 0;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
      continue;
    } else {
      continue;
    }

    game.makeMove(m);
    const score = -quiescence(game, -beta, -alpha, qDepth - 1, ply + 1);
    game.unmakeMove();

    if (aborted) return 0;
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }

  return alpha;
}

function alphaBeta(
  game: ChessGame,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  allowNull: boolean,
): number {
  nodes++;
  if (checkTime()) return 0;

  if (ply > 0 && (game.isThreefoldRepetition() || game.isFiftyMoveRule())) {
    return 0;
  }

  if (depth <= 0) {
    if (cfg.maxQDepth > 0) return quiescence(game, alpha, beta, 0, ply);
    return evalPos(game);
  }

  let hashFrom = 0;
  let hashTo = 0;
  let hashPromo = 0;

  if (cfg.useTT) {
    const idx = game.hash & TT_MASK;
    if (ttHash[idx] === game.hash && ttFlag[idx] !== TT_NONE) {
      hashFrom = ttMoveFrom[idx];
      hashTo = ttMoveTo[idx];
      hashPromo = ttMovePromo[idx];

      if (ttDepth[idx] >= depth) {
        const score = scoreFromTT(ttScore[idx], ply);
        const flag = ttFlag[idx];
        if (flag === TT_EXACT) return score;
        if (flag === TT_ALPHA && score <= alpha) return alpha;
        if (flag === TT_BETA && score >= beta) return beta;
      }
    }
  }

  const inCheck = game.isCheck();
  const extension = inCheck ? 1 : 0;

  if (cfg.nullMove && allowNull && !inCheck && depth >= 3 && ply > 0) {
    if (hasNonPawnMaterial(game.state.board, game.state.turn)) {
      const R = depth > 6 ? 3 : 2;
      const saved = makeNull(game);
      const nullScore = -alphaBeta(game, depth - 1 - R, -beta, -beta + 1, ply + 1, false);
      unmakeNull(game, saved);
      if (aborted) return 0;
      if (nullScore >= beta) return beta;
    }
  }

  const moves = game.getLegalMoves();
  if (moves.length === 0) {
    return inCheck ? (-MATE + ply) : 0;
  }

  const moveScores = moves.map(m => scoreMove(m, ply, hashFrom, hashTo, hashPromo));

  let bestScore = -INF;
  let bestMove: Move | null = null;
  let ttFlagVal = TT_ALPHA;

  for (let i = 0; i < moves.length; i++) {
    pickBest(moves, moveScores, i);
    const m = moves[i];

    game.makeMove(m);

    let score: number;

    if (cfg.lmr && i >= 4 && depth >= 3 && !inCheck && !(m.flags & FLAG_CAPTURE) && !m.promotion) {
      score = -alphaBeta(game, depth - 2 + extension, -alpha - 1, -alpha, ply + 1, true);
      if (score > alpha && !aborted) {
        score = -alphaBeta(game, depth - 1 + extension, -beta, -alpha, ply + 1, true);
      }
    } else {
      score = -alphaBeta(game, depth - 1 + extension, -beta, -alpha, ply + 1, true);
    }

    game.unmakeMove();

    if (aborted) return 0;

    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
    }

    if (score > alpha) {
      alpha = score;
      ttFlagVal = TT_EXACT;
    }

    if (alpha >= beta) {
      ttFlagVal = TT_BETA;
      storeKiller(m, ply);
      if (!(m.flags & FLAG_CAPTURE)) {
        history[histIdx(m.piece, m.to)] += depth * depth;
      }
      break;
    }
  }

  if (cfg.useTT && !aborted && bestMove) {
    ttStore(game.hash, depth, bestScore, ttFlagVal, bestMove, ply);
  }

  return bestScore;
}

function xorshift(s: number): number {
  let x = s;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

export function search(
  game: ChessGame,
  difficulty: Difficulty,
  onProgress?: (result: SearchResult) => void,
): SearchResult {
  cfg = CONFIGS[difficulty];
  nodes = 0;
  startTime = performance.now();
  timeLimit = cfg.timeLimit;
  aborted = false;
  clearTables();

  const moves = game.getLegalMoves();
  if (moves.length <= 1) {
    return { bestMove: moves[0], score: 0, depth: 1, nodes: 1 };
  }

  let bestResult: SearchResult = { bestMove: moves[0], score: 0, depth: 0, nodes: 0 };
  const rootScores = new Array<number>(moves.length).fill(0);
  const order = moves.map((_, i) => i);

  let rngState = game.hash || 1;

  for (let depth = 1; depth <= cfg.maxDepth; depth++) {
    aborted = false;

    if (depth > 1) {
      order.sort((a, b) => rootScores[b] - rootScores[a]);
    }

    let alpha = -INF;
    let iterBestScore = -INF;
    let iterBestIdx = order[0];

    for (let i = 0; i < order.length; i++) {
      const moveIdx = order[i];
      const m = moves[moveIdx];

      game.makeMove(m);
      const score = -alphaBeta(game, depth - 1, -INF, -alpha, 1, true);
      game.unmakeMove();

      if (aborted) break;

      rootScores[moveIdx] = score;

      if (score > iterBestScore) {
        iterBestScore = score;
        iterBestIdx = moveIdx;
      }
      if (score > alpha) alpha = score;
    }

    if (!aborted) {
      bestResult = { bestMove: moves[iterBestIdx], score: iterBestScore, depth, nodes };
      onProgress?.(bestResult);
      if (iterBestScore > MATE_THRESHOLD || iterBestScore < -MATE_THRESHOLD) break;
    }

    if (performance.now() - startTime >= timeLimit) break;
  }

  if (cfg.noise > 0 && moves.length > 1) {
    let noisyBest = -INF;
    let noisyIdx = 0;
    for (let i = 0; i < moves.length; i++) {
      rngState = xorshift(rngState);
      const noise = ((rngState / 4294967296) - 0.5) * 2 * cfg.noise;
      const adjusted = rootScores[i] + noise;
      if (adjusted > noisyBest) {
        noisyBest = adjusted;
        noisyIdx = i;
      }
    }
    bestResult.bestMove = moves[noisyIdx];
  }

  return bestResult;
}
