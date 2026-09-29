import { describe, expect, it } from "vitest";
import { type Move, moveToUci, moveTo, QUEEN, WHITE } from "../chess/move";
import { makePiece, Position, START_FEN } from "../chess/position";
import { MATE_SCORE, type SearchLimits, Searcher } from "./search";

const searcher = new Searcher({ transpositionTableBits: 16 });

const QUICK: SearchLimits = { maxDepth: 64, timeLimitMs: 300, candidateMargin: 0 };

const bestMoveFor = (fen: string, limits: SearchLimits = QUICK): string =>
  moveToUci(searcher.search(Position.fromFen(fen), limits).bestMove);

/** Plays UCI moves from a FEN, as a game history the search can see repetitions in. */
const playFrom = (fen: string, moves: readonly string[]): Position => {
  const position = Position.fromFen(fen);
  for (const uci of moves) {
    const move = position.parseUci(uci);
    if (move === 0) throw new Error(`Test setup: illegal move ${uci}`);
    position.makeMove(move);
  }
  return position;
};

/** Exhaustive check that the side to move can force checkmate within `moves` of its own moves. */
const canForceMate = (position: Position, moves: number): boolean => {
  if (moves === 0) return false;
  return position.generateLegalMoves().some((move) => {
    position.makeMove(move);
    const forced = everyReplyLosesToMate(position, moves - 1);
    position.unmakeMove();
    return forced;
  });
};

const everyReplyLosesToMate = (position: Position, movesLeft: number): boolean => {
  const replies = position.generateLegalMoves();
  if (replies.length === 0) return position.inCheck();
  return replies.every((reply) => {
    position.makeMove(reply);
    const forced = canForceMate(position, movesLeft);
    position.unmakeMove();
    return forced;
  });
};

const PERFT_FENS = [
  START_FEN,
  "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
  "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
  "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
  "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
  "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
];

describe("Searcher tactics", () => {
  it("finds a back-rank mate in one", () => {
    const result = searcher.search(Position.fromFen("6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1"), QUICK);
    expect(moveToUci(result.bestMove)).toBe("d1d8");
    expect(result.score).toBe(MATE_SCORE - 1);
  });

  it("finds a forced mate in two that starts with a quiet move", () => {
    const fen = "7k/8/8/8/8/8/1R6/R5K1 w - - 0 1";
    const position = Position.fromFen(fen);
    expect(canForceMate(position, 1)).toBe(false);
    expect(canForceMate(position, 2)).toBe(true);

    const result = searcher.search(position, QUICK);
    expect(result.score).toBe(MATE_SCORE - 3);
    position.makeMove(result.bestMove);
    expect(everyReplyLosesToMate(position, 1)).toBe(true);
  });

  it("captures a hanging queen", () => {
    expect(bestMoveFor("4k3/pp6/8/3q4/8/4N3/PP6/4K3 w - - 0 1")).toBe("e3d5");
  });

  it("moves an attacked queen somewhere it cannot be taken", () => {
    const position = Position.fromFen("r3k3/pp6/8/4p3/3Q4/8/PP6/4K3 w - - 0 1");
    position.makeMove(searcher.search(position, QUICK).bestMove);
    const whiteQueen = makePiece(WHITE, QUEEN);
    const queenCaptures = position.generateLegalMoves().filter((move: Move) => position.board[moveTo(move)] === whiteQueen);
    expect(queenCaptures).toEqual([]);
  });
});

describe("Searcher draws", () => {
  // Knights shuffle between the same squares, so the next knight retreat repeats a position for the third time.
  const SHUFFLE = ["b1c3", "a7b7", "c3b1", "b7a7", "b1c3", "a7b7", "c3b1", "b7a7", "b1c3", "a7b7"];

  it("repeats the position to escape a lost game", () => {
    const position = playFrom("7k/r3q3/8/8/8/8/8/1N5K w - - 0 1", SHUFFLE);
    const result = searcher.search(position, QUICK);
    expect(moveToUci(result.bestMove)).toBe("c3b1");
    expect(result.score).toBe(0);
  });

  it("avoids repeating the position when winning", () => {
    const winningShuffle = ["b1c3", "g8f6", "c3b1", "f6g8", "b1c3", "g8f6", "c3b1", "f6g8", "b1c3", "g8f6"];
    const position = playFrom("6nk/8/8/8/8/8/3Q4/1N1R3K w - - 0 1", winningShuffle);
    const result = searcher.search(position, QUICK);
    expect(moveToUci(result.bestMove)).not.toBe("c3b1");
    expect(result.score).toBeGreaterThan(500);
  });

  it("does not stalemate a lone king when mate is available", () => {
    const result = searcher.search(Position.fromFen("k7/8/1K6/8/8/8/8/2Q5 w - - 0 1"), QUICK);
    expect(result.score).toBe(MATE_SCORE - 1);
  });
});

describe("Searcher robustness", () => {
  it.each(PERFT_FENS)("returns a legal move in %s", (fen) => {
    const position = Position.fromFen(fen);
    const legal = position.generateLegalMoves();
    const result = searcher.search(position, { maxDepth: 64, timeLimitMs: 100, candidateMargin: 0 });
    expect(legal).toContain(result.bestMove);
    expect(position.toFen()).toBe(Position.fromFen(fen).toFen());
  });

  it("stops close to the time limit", () => {
    const started = performance.now();
    const result = searcher.search(Position.fromFen(PERFT_FENS[1]), { maxDepth: 64, timeLimitMs: 200, candidateMargin: 0 });
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(400);
    expect(result.depth).toBeGreaterThanOrEqual(1);
  });

  it("stops at the maximum depth", () => {
    const result = searcher.search(Position.fromFen(START_FEN), { maxDepth: 2, timeLimitMs: 10_000, candidateMargin: 0 });
    expect(result.depth).toBe(2);
  });

  it("completes depth one even with no time at all", () => {
    const position = Position.fromFen(PERFT_FENS[5]);
    const result = searcher.search(position, { maxDepth: 64, timeLimitMs: 0, candidateMargin: 0 });
    expect(result.depth).toBeGreaterThanOrEqual(1);
    expect(position.generateLegalMoves()).toContain(result.bestMove);
  });

  it("answers immediately when only one move is legal", () => {
    const started = performance.now();
    const result = searcher.search(Position.fromFen("k7/8/8/8/8/8/6q1/7K w - - 0 1"), {
      maxDepth: 64,
      timeLimitMs: 10_000,
      candidateMargin: 0,
    });
    expect(moveToUci(result.bestMove)).toBe("h1g2");
    expect(performance.now() - started).toBeLessThan(100);
  });

  it("refuses to search a position with no legal moves", () => {
    expect(() => searcher.search(Position.fromFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"), QUICK)).toThrow(/no legal moves/i);
  });
});

describe("Searcher candidates", () => {
  it("returns only the best move when the margin is zero", () => {
    const result = searcher.search(Position.fromFen(START_FEN), { maxDepth: 3, timeLimitMs: 1000, candidateMargin: 0 });
    expect(result.candidates).toEqual([{ move: result.bestMove, score: result.score }]);
  });

  it("returns every move within the margin with an exact score, best first", () => {
    const margin = 40;
    const result = searcher.search(Position.fromFen(START_FEN), { maxDepth: 3, timeLimitMs: 1000, candidateMargin: margin });
    expect(result.candidates.length).toBeGreaterThan(1);
    expect(result.candidates[0]).toEqual({ move: result.bestMove, score: result.score });
    const scores = result.candidates.map((candidate) => candidate.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    for (const score of scores) expect(score).toBeGreaterThanOrEqual(result.score - margin);
  });
});
