/**
 * Move selection: negamax alpha-beta with quiescence, transposition table,
 * killer moves and iterative deepening. The four difficulty levels differ in
 * search depth, time budget and deliberate root noise.
 */
import {
  BISHOP,
  Board,
  KING,
  KNIGHT,
  PAWN,
  QUEEN,
  ROOK,
  WHITE,
  fileOf,
  moveFrom,
  moveIsCapture,
  moveIsEnPassant,
  movePromo,
  moveTo,
  rankOf
} from "./board";

export type SearchDifficulty = "easy" | "medium" | "hard" | "expert";

const MATE = 100000;
const TIMEOUT = Symbol("search-timeout");

const PIECE_VALUES: readonly number[] = [0, 100, 320, 330, 500, 900, 20000];

// Piece-square tables (white's view, a1 first), Michniewski's simplified eval.
const PST_PAWN = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, -20, -20, 10, 10, 5,
  5, -5, -10, 0, 0, -10, -5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, 5, 10, 25, 25, 10, 5, 5,
  10, 10, 20, 30, 30, 20, 10, 10,
  50, 50, 50, 50, 50, 50, 50, 50,
  0, 0, 0, 0, 0, 0, 0, 0
];
const PST_KNIGHT = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50
];
const PST_BISHOP = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -20, -10, -10, -10, -10, -10, -10, -20
];
const PST_ROOK = [
  0, 0, 0, 5, 5, 0, 0, 0,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  5, 10, 10, 10, 10, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0
];
const PST_QUEEN = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -10, 5, 5, 5, 5, 5, 0, -10,
  0, 0, 5, 5, 5, 5, 0, -5,
  -5, 0, 5, 5, 5, 5, 0, -5,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20
];
const PST_KING_MID = [
  20, 30, 10, 0, 0, 10, 30, 20,
  20, 20, 0, 0, 0, 0, 20, 20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30
];
const PST_KING_END = [
  -50, -30, -30, -30, -30, -30, -30, -50,
  -30, -30, 0, 0, 0, 0, -30, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -20, -10, 0, 0, -10, -20, -30,
  -50, -40, -30, -20, -20, -30, -40, -50
];

const PSTS: Record<number, readonly number[]> = {
  [PAWN]: PST_PAWN,
  [KNIGHT]: PST_KNIGHT,
  [BISHOP]: PST_BISHOP,
  [ROOK]: PST_ROOK,
  [QUEEN]: PST_QUEEN
};

/** Score from the perspective of the side to move, in centipawns. */
export const evaluate = (board: Board): number => {
  let score = 0;
  let nonPawnMaterial = 0;
  const kingSquares: number[] = [-1, -1];
  board.forEachPiece((sq, type, color) => {
    if (type === KING) {
      kingSquares[color] = sq;
      return;
    }
    if (type !== PAWN) nonPawnMaterial += PIECE_VALUES[type] ?? 0;
    const index64 =
      color === WHITE ? rankOf(sq) * 8 + fileOf(sq) : (7 - rankOf(sq)) * 8 + fileOf(sq);
    const value = (PIECE_VALUES[type] ?? 0) + (PSTS[type]?.[index64] ?? 0);
    score += color === WHITE ? value : -value;
  });
  const endgame = nonPawnMaterial < 2600;
  const kingTable = endgame ? PST_KING_END : PST_KING_MID;
  for (const color of [0, 1] as const) {
    const sq = kingSquares[color] ?? -1;
    if (sq < 0) continue;
    const index64 =
      color === WHITE ? rankOf(sq) * 8 + fileOf(sq) : (7 - rankOf(sq)) * 8 + fileOf(sq);
    score += color === WHITE ? (kingTable[index64] ?? 0) : -(kingTable[index64] ?? 0);
  }
  return board.turn() === "w" ? score : -score;
};

interface TTEntry {
  depth: number;
  score: number;
  flag: 0 | 1 | 2; // exact, lower bound, upper bound
  move: number;
}

interface SearchContext {
  deadline: number;
  nodes: number;
  tt: Map<number, TTEntry>;
  killers: number[][];
}

const victimValue = (board: Board, move: number): number => {
  if (moveIsEnPassant(move)) return PIECE_VALUES[PAWN] ?? 0;
  const victim = board.pieceAt(moveTo(move));
  return victim ? PIECE_VALUES[victim.type] ?? 0 : 0;
};

const orderMoves = (
  board: Board,
  moves: number[],
  ttMove: number,
  killers: number[]
): number[] => {
  const scored = moves.map((move) => {
    let score = 0;
    if (move === ttMove) {
      score = 1_000_000;
    } else if (moveIsCapture(move)) {
      const attacker = board.pieceAt(moveFrom(move));
      score =
        100_000 + victimValue(board, move) * 10 - (attacker ? PIECE_VALUES[attacker.type] ?? 0 : 0);
    } else if (movePromo(move) !== 0) {
      score = 90_000 + (PIECE_VALUES[movePromo(move)] ?? 0);
    } else if (killers.includes(move)) {
      score = 80_000;
    }
    return { move, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((entry) => entry.move);
};

const checkTime = (ctx: SearchContext): void => {
  ctx.nodes++;
  if ((ctx.nodes & 2047) === 0 && Date.now() > ctx.deadline) {
    throw TIMEOUT;
  }
};

const quiescence = (board: Board, alpha: number, beta: number, ctx: SearchContext): number => {
  checkTime(ctx);
  const stand = evaluate(board);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;

  const captures = orderMoves(board, board.legalCaptures(), 0, []);
  for (const move of captures) {
    board.makeMove(move);
    const score = -quiescence(board, -beta, -alpha, ctx);
    board.undoMove();
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
};

const negamax = (
  board: Board,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  ctx: SearchContext
): number => {
  checkTime(ctx);

  if (ply > 0 && (board.repetitionCount() >= 2 || board.halfmoves() >= 100)) {
    return 0;
  }

  const key = board.key();
  const entry = ctx.tt.get(key);
  let ttMove = 0;
  if (entry) {
    ttMove = entry.move;
    if (entry.depth >= depth && ply > 0) {
      if (entry.flag === 0) return entry.score;
      if (entry.flag === 1 && entry.score >= beta) return entry.score;
      if (entry.flag === 2 && entry.score <= alpha) return entry.score;
    }
  }

  if (depth <= 0) {
    return quiescence(board, alpha, beta, ctx);
  }

  const moves = board.legalMoves();
  if (moves.length === 0) {
    return board.inCheck() ? -(MATE - ply) : 0;
  }

  const killers = ctx.killers[ply] ?? (ctx.killers[ply] = []);
  const ordered = orderMoves(board, moves, ttMove, killers);
  const alphaOriginal = alpha;
  let bestScore = -Infinity;
  let bestMove = 0;

  for (const move of ordered) {
    board.makeMove(move);
    const score = -negamax(board, depth - 1, -beta, -alpha, ply + 1, ctx);
    board.undoMove();
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) {
      if (!moveIsCapture(move)) {
        killers.unshift(move);
        if (killers.length > 2) killers.pop();
      }
      break;
    }
  }

  const flag: TTEntry["flag"] = bestScore <= alphaOriginal ? 2 : bestScore >= beta ? 1 : 0;
  ctx.tt.set(key, { depth, score: bestScore, flag, move: bestMove });
  return bestScore;
};

interface LevelProfile {
  maxDepth: number;
  budgetMs: number;
  noise: number;
  randomMoveChance: number;
}

const PROFILES: Record<SearchDifficulty, LevelProfile> = {
  easy: { maxDepth: 1, budgetMs: 400, noise: 220, randomMoveChance: 0.3 },
  medium: { maxDepth: 2, budgetMs: 900, noise: 25, randomMoveChance: 0 },
  hard: { maxDepth: 4, budgetMs: 2200, noise: 0, randomMoveChance: 0 },
  expert: { maxDepth: 32, budgetMs: 3500, noise: 0, randomMoveChance: 0 }
};

/**
 * Picks a move for the side to move, or null when the game is over.
 * `rng` is injectable for deterministic tests; only easy and medium use it.
 */
export const chooseMove = (
  board: Board,
  difficulty: SearchDifficulty,
  rng: () => number = Math.random
): number | null => {
  if (board.status() !== "playing") return null;
  const moves = board.legalMoves();
  if (moves.length === 0) return null;
  const profile = PROFILES[difficulty];

  if (profile.randomMoveChance > 0 && rng() < profile.randomMoveChance) {
    return moves[Math.floor(rng() * moves.length)] ?? null;
  }

  const ctx: SearchContext = {
    deadline: Date.now() + profile.budgetMs,
    nodes: 0,
    tt: new Map(),
    killers: []
  };
  const baseDepth = board.historyDepth();
  const unwindTo = (depth: number): void => {
    while (board.historyDepth() > depth) board.undoMove();
  };

  // Easy and medium score every root move independently and add noise, so
  // their play is fallible in a human way rather than uniformly random.
  if (profile.noise > 0) {
    let bestMove = moves[0] ?? 0;
    let bestScore = -Infinity;
    for (const move of moves) {
      board.makeMove(move);
      let score: number;
      try {
        score = -negamax(board, profile.maxDepth - 1, -MATE, MATE, 1, ctx);
      } catch (error) {
        if (error !== TIMEOUT) throw error;
        unwindTo(baseDepth + 1);
        score = -evaluate(board);
      }
      board.undoMove();
      score += (rng() * 2 - 1) * profile.noise;
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }
    return bestMove;
  }

  let bestMove = moves[0] ?? 0;
  for (let depth = 1; depth <= profile.maxDepth; depth++) {
    try {
      const ordered = orderMoves(board, moves, bestMove, []);
      let alpha = -MATE;
      let iterationBest = ordered[0] ?? 0;
      for (const move of ordered) {
        board.makeMove(move);
        const score = -negamax(board, depth - 1, -MATE, -alpha, 1, ctx);
        board.undoMove();
        if (score > alpha) {
          alpha = score;
          iterationBest = move;
        }
      }
      bestMove = iterationBest;
      if (alpha > MATE - 1000) break; // Mate found, deeper search is pointless.
    } catch (error) {
      if (error !== TIMEOUT) throw error;
      unwindTo(baseDepth);
      break;
    }
  }
  return bestMove;
};
