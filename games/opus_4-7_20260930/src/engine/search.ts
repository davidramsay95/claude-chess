import { Position, Move, pieceType, isWhitePiece, fileOf, rankOf } from "./types.js";
import { generateLegalMoves, makeMove, inCheck } from "./moves.js";

// Piece values in centipawns.
const PV: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// Piece-square tables (from white's perspective, rank 0 = rank 1). Simple standard-ish tables.
const PST_P = [
   0,  0,  0,  0,  0,  0,  0,  0,
   5, 10, 10,-20,-20, 10, 10,  5,
   5, -5,-10,  0,  0,-10, -5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5,  5, 10, 25, 25, 10,  5,  5,
  10, 10, 20, 30, 30, 20, 10, 10,
  50, 50, 50, 50, 50, 50, 50, 50,
   0,  0,  0,  0,  0,  0,  0,  0,
];
const PST_N = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
];
const PST_B = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -20,-10,-10,-10,-10,-10,-10,-20,
];
const PST_R = [
   0,  0,  5, 10, 10,  5,  0,  0,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   5, 10, 10, 10, 10, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0,
];
const PST_Q = [
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  5,  0,  0,  0,  0,-10,
  -10,  5,  5,  5,  5,  5,  0,-10,
    0,  0,  5,  5,  5,  5,  0, -5,
   -5,  0,  5,  5,  5,  5,  0, -5,
  -10,  0,  5,  5,  5,  5,  0,-10,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20,
];
const PST_K_MID = [
   20, 30, 10,  0,  0, 10, 30, 20,
   20, 20,  0,  0,  0,  0, 20, 20,
  -10,-20,-20,-20,-20,-20,-20,-10,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
];
const PST_K_END = [
  -50,-30,-30,-30,-30,-30,-30,-50,
  -30,-30,  0,  0,  0,  0,-30,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-20,-10,  0,  0,-10,-20,-30,
  -50,-40,-30,-20,-20,-30,-40,-50,
];

function mirrorSq(sq: number): number {
  // Flip vertically so PST for black uses the same table (index into rank 7-r).
  return (7 - rankOf(sq)) * 8 + fileOf(sq);
}

// Total non-pawn/king material (in centipawns) used to detect endgame for king PST.
function nonPawnMaterial(pos: Position): number {
  let m = 0;
  for (let i = 0; i < 64; i++) {
    const p = pos.board[i]; if (!p) continue;
    const t = pieceType(p);
    if (t === "n" || t === "b" || t === "r" || t === "q") m += PV[t];
  }
  return m;
}

export function evaluate(pos: Position): number {
  // Positive = white advantage in centipawns.
  let score = 0;
  const npm = nonPawnMaterial(pos);
  const endgame = npm < 1500;
  for (let sq = 0; sq < 64; sq++) {
    const p = pos.board[sq]; if (!p) continue;
    const t = pieceType(p);
    const white = isWhitePiece(p);
    const v = PV[t];
    const idx = white ? sq : mirrorSq(sq);
    let pst = 0;
    switch (t) {
      case "p": pst = PST_P[idx]; break;
      case "n": pst = PST_N[idx]; break;
      case "b": pst = PST_B[idx]; break;
      case "r": pst = PST_R[idx]; break;
      case "q": pst = PST_Q[idx]; break;
      case "k": pst = endgame ? PST_K_END[idx] : PST_K_MID[idx]; break;
    }
    score += white ? (v + pst) : -(v + pst);
  }
  // Tempo bonus
  score += pos.turn === "w" ? 5 : -5;
  // Return from side-to-move perspective for negamax
  return pos.turn === "w" ? score : -score;
}

interface Ctx {
  deadline: number;
  aborted: boolean;
  nodes: number;
}

const MATE = 30000;

function isCapture(pos: Position, mv: Move): boolean {
  if (pos.board[mv.to]) return true;
  const p = pos.board[mv.from];
  if (p && pieceType(p) === "p" && pos.epTarget === mv.to && fileOf(mv.from) !== fileOf(mv.to)) return true;
  return false;
}

function moveOrderScore(pos: Position, mv: Move): number {
  let s = 0;
  const attacker = pos.board[mv.from];
  const victim = pos.board[mv.to];
  if (victim && attacker) {
    // MVV-LVA
    s += 10000 + PV[pieceType(victim)] * 10 - PV[pieceType(attacker)];
  } else if (attacker && pieceType(attacker) === "p" && pos.epTarget === mv.to && fileOf(mv.from) !== fileOf(mv.to)) {
    s += 10000 + PV["p"] * 10 - PV["p"];
  }
  if (mv.promo) s += 8000 + PV[mv.promo];
  return s;
}

function orderMoves(pos: Position, moves: Move[]): Move[] {
  return moves.map(m => ({ m, s: moveOrderScore(pos, m) })).sort((a, b) => b.s - a.s).map(x => x.m);
}

function quiescence(pos: Position, alpha: number, beta: number, ctx: Ctx): number {
  ctx.nodes++;
  if (ctx.nodes % 2048 === 0 && Date.now() > ctx.deadline) { ctx.aborted = true; return 0; }
  const stand = evaluate(pos);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  const moves = generateLegalMoves(pos).filter(m => isCapture(pos, m) || m.promo);
  const ordered = orderMoves(pos, moves);
  for (const mv of ordered) {
    const { next } = makeMove(pos, mv);
    const score = -quiescence(next, -beta, -alpha, ctx);
    if (ctx.aborted) return 0;
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(pos: Position, depth: number, alpha: number, beta: number, ply: number, ctx: Ctx, useQuiescence: boolean): number {
  ctx.nodes++;
  if (ctx.nodes % 2048 === 0 && Date.now() > ctx.deadline) { ctx.aborted = true; return 0; }
  if (depth === 0) return useQuiescence ? quiescence(pos, alpha, beta, ctx) : evaluate(pos);

  const moves = generateLegalMoves(pos);
  if (moves.length === 0) {
    if (inCheck(pos, pos.turn)) return -MATE + ply;
    return 0;
  }
  const ordered = orderMoves(pos, moves);
  let best = -Infinity;
  for (const mv of ordered) {
    const { next } = makeMove(pos, mv);
    const score = -negamax(next, depth - 1, -beta, -alpha, ply + 1, ctx, useQuiescence);
    if (ctx.aborted) return 0;
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

export type Difficulty = "easy" | "medium" | "hard" | "expert";

export interface SearchResult { move: Move; score: number; depth: number; nodes: number; timeMs: number; }

interface Cfg { maxDepth: number; timeMs: number; useQuiescence: boolean; randomTopN: number; blunderChance: number; }

function cfgFor(d: Difficulty): Cfg {
  switch (d) {
    case "easy":   return { maxDepth: 2, timeMs: 300,  useQuiescence: false, randomTopN: 4, blunderChance: 0.25 };
    case "medium": return { maxDepth: 3, timeMs: 800,  useQuiescence: true,  randomTopN: 2, blunderChance: 0.05 };
    case "hard":   return { maxDepth: 4, timeMs: 2500, useQuiescence: true,  randomTopN: 1, blunderChance: 0 };
    case "expert": return { maxDepth: 6, timeMs: 4500, useQuiescence: true,  randomTopN: 1, blunderChance: 0 };
  }
}

export function chooseMove(pos: Position, difficulty: Difficulty, rand: () => number = Math.random): SearchResult {
  const cfg = cfgFor(difficulty);
  const start = Date.now();
  const deadline = start + cfg.timeMs;
  const ctx: Ctx = { deadline, aborted: false, nodes: 0 };

  const legal = generateLegalMoves(pos);
  if (legal.length === 0) throw new Error("No legal moves");

  // Easy: sometimes play a random move to make the AI more beatable for beginners.
  if (difficulty === "easy" && rand() < cfg.blunderChance) {
    const pick = legal[Math.floor(rand() * legal.length)];
    return { move: pick, score: 0, depth: 0, nodes: 0, timeMs: Date.now() - start };
  }

  // Iterative deepening; keep the last completed depth's PV.
  let best: { move: Move; score: number } | null = null;
  let scored: { move: Move; score: number }[] = [];
  let lastDepth = 0;
  for (let depth = 1; depth <= cfg.maxDepth; depth++) {
    const results: { move: Move; score: number }[] = [];
    const ordered = orderMoves(pos, legal);
    let alpha = -Infinity;
    const beta = Infinity;
    for (const mv of ordered) {
      const { next } = makeMove(pos, mv);
      const score = -negamax(next, depth - 1, -beta, -alpha, 1, ctx, cfg.useQuiescence);
      if (ctx.aborted) break;
      results.push({ move: mv, score });
      if (score > alpha) alpha = score;
    }
    if (ctx.aborted) break;
    results.sort((a, b) => b.score - a.score);
    scored = results;
    best = results[0];
    lastDepth = depth;
    if (Math.abs(best.score) > MATE - 100) break; // forced mate found
    if (Date.now() > deadline) break;
  }

  if (!best) {
    // Never happens because depth 1 always completes fast for legal < 250; fall back randomly.
    best = { move: legal[Math.floor(rand() * legal.length)], score: 0 };
  }

  // Difficulty randomization: choose among top-N moves.
  if (cfg.randomTopN > 1 && scored.length > 1) {
    const topScore = scored[0].score;
    // Consider any move within e.g. 30cp of top for randomization pool.
    const window = difficulty === "easy" ? 80 : 30;
    const pool = scored.filter(x => topScore - x.score <= window).slice(0, cfg.randomTopN);
    best = pool[Math.floor(rand() * pool.length)];
  }

  return { move: best.move, score: best.score, depth: lastDepth, nodes: ctx.nodes, timeMs: Date.now() - start };
}

