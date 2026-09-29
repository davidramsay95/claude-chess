import { describe, expect, it } from "vitest";
import { Game } from "../core/game";
import { Position, START_FEN, WHITE, moveToUci } from "../core/position";
import { evaluate } from "./evaluate";
import { DIFFICULTIES, Difficulty } from "./difficulty";
import { DIFFICULTY_SETTINGS, MATE_SCORE, SearchRequest, SearchResult, findBestMove } from "./search";

const KIWIPETE = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
const BUSY_MIDDLEGAME = "r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP1B1PPP/R2QKB1R w KQ - 0 8";
const BACK_RANK_MATE_IN_ONE = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
const SMOTHERED_MATE_IN_ONE = "6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1";
const DEFLECTION_MATE_IN_TWO = "3r2k1/5ppp/8/8/8/8/4RPPP/4R1K1 w - - 0 1";
const HANGING_QUEEN = "rnb1kbnr/pppp1ppp/8/4p3/4P2q/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1";
const POISONED_KNIGHT = "4r1k1/5ppp/8/8/n7/8/P4PPP/3Q2K1 w - - 0 1";
const ONLY_ONE_MOVE = "k7/8/8/8/8/8/1r6/K1r5 w - - 0 1";
const CHECKMATED = "6k1/5ppp/8/8/8/8/5PPP/r5K1 w - - 0 1";

/**
 * A clock that runs `factor` times faster than real time, so full-strength levels finish their
 * time budget quickly in tests while still exercising the real time-control path.
 */
const fastClock = (factor: number): (() => number) => {
  const origin = performance.now();
  return (): number => origin + (performance.now() - origin) * factor;
};

const search = (fen: string, difficulty: Difficulty, moves: string[] = [], seed = 1): SearchResult => {
  const request: SearchRequest = { startFen: fen, moves, difficulty, seed };
  return findBestMove(request, fastClock(8));
};

const positionAfter = (fen: string, moves: string[]): Position => {
  const position = Position.fromFen(fen);
  for (const uci of moves) {
    const move = position.parseUci(uci);
    if (move === null) throw new Error(`illegal test move ${uci}`);
    position.makeMove(move);
  }
  return position;
};

const isCheckmate = (position: Position): boolean => position.inCheck() && position.legalMoves().length === 0;

const mateInOneMoves = (position: Position): string[] =>
  position.legalMoves().flatMap((move): string[] => {
    position.makeMove(move);
    const mates = isCheckmate(position);
    position.unmakeMove();
    return mates ? [moveToUci(move)] : [];
  });

/** Brute-force check, independent of the engine, that `uci` forces mate on the following move. */
const forcesMateInTwo = (fen: string, uci: string): boolean => {
  const position = positionAfter(fen, [uci]);
  if (isCheckmate(position)) return true;
  const replies = position.legalMoves();
  return (
    replies.length > 0 &&
    replies.every((reply): boolean => {
      position.makeMove(reply);
      const mated = mateInOneMoves(position).length > 0;
      position.unmakeMove();
      return mated;
    })
  );
};

const isLegal = (fen: string, moves: string[], uci: string): boolean =>
  positionAfter(fen, moves).parseUci(uci) !== null;

const STRONG_LEVELS: Difficulty[] = ["medium", "hard", "expert"];
const DEEP_LEVELS: Difficulty[] = ["hard", "expert"];
const NOISY_LEVELS: Difficulty[] = ["easy", "medium"];

describe("DIFFICULTY_SETTINGS", () => {
  it("has strictly increasing time budgets that stay inside the 4 second reply window", () => {
    const budgets = DIFFICULTIES.map((difficulty): number => DIFFICULTY_SETTINGS[difficulty].hardTimeMs);
    budgets.slice(1).forEach((budget, index): void => expect(budget).toBeGreaterThan(budgets[index]));
    expect(DIFFICULTY_SETTINGS.expert.hardTimeMs).toBeLessThanOrEqual(4000);
  });

  it("gets deeper and less noisy as the level rises", () => {
    const depths = DIFFICULTIES.map((difficulty): number => DIFFICULTY_SETTINGS[difficulty].maxDepth);
    const noise = DIFFICULTIES.map((difficulty): number => DIFFICULTY_SETTINGS[difficulty].noise);
    depths.slice(1).forEach((depth, index): void => expect(depth).toBeGreaterThan(depths[index]));
    expect(noise[0]).toBeGreaterThan(noise[1]);
    expect(noise[1]).toBeGreaterThan(0);
    expect(DIFFICULTY_SETTINGS.hard.noise).toBe(0);
    expect(DIFFICULTY_SETTINGS.expert.noise).toBe(0);
  });
});

describe("findBestMove tactics", () => {
  it("keeps easy to a single ply so it overlooks the opponent's threats", () => {
    expect(search(BUSY_MIDDLEGAME, "easy").depth).toBe(1);
  });

  it.each(STRONG_LEVELS)("finds a back-rank mate in one at %s", (difficulty) => {
    const result = search(BACK_RANK_MATE_IN_ONE, difficulty);
    expect(result.move).toBe("a1a8");
    expect(result.score).toBeGreaterThan(MATE_SCORE - 100);
  });

  it.each(STRONG_LEVELS)("finds a smothered mate in one at %s", (difficulty) => {
    expect(search(SMOTHERED_MATE_IN_ONE, difficulty).move).toBe("g5f7");
  });

  it("uses a mate-in-two position with no mate in one", () => {
    expect(mateInOneMoves(Position.fromFen(DEFLECTION_MATE_IN_TWO))).toEqual([]);
  });

  it.each(DEEP_LEVELS)("finds a mate in two at %s", (difficulty) => {
    const result = search(DEFLECTION_MATE_IN_TWO, difficulty);
    expect(forcesMateInTwo(DEFLECTION_MATE_IN_TWO, result.move)).toBe(true);
    expect(result.score).toBe(MATE_SCORE - 3);
  });

  it.each(STRONG_LEVELS)("captures a hanging queen at %s", (difficulty) => {
    expect(search(HANGING_QUEEN, difficulty).move).toBe("f3h4");
  });

  it.each(DEEP_LEVELS)("declines a capture that allows mate in one at %s", (difficulty) => {
    const result = search(POISONED_KNIGHT, difficulty);
    expect(result.move).not.toBe("d1a4");
    expect(mateInOneMoves(positionAfter(POISONED_KNIGHT, [result.move]))).toEqual([]);
  });
});

describe("findBestMove legality and edge cases", () => {
  const positions: [string, string[]][] = [
    [START_FEN, []],
    [START_FEN, ["e2e4", "c7c5", "g1f3"]],
    [KIWIPETE, []],
    ["8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", []],
    ["4k3/8/8/8/8/8/4P3/4K3 b - - 0 1", []],
  ];

  it.each(DIFFICULTIES)("returns a legal move from several positions at %s", (difficulty) => {
    for (const [fen, moves] of positions) {
      const result = search(fen, difficulty, moves);
      expect(isLegal(fen, moves, result.move)).toBe(true);
      expect(result.depth).toBeGreaterThanOrEqual(1);
      expect(result.nodes).toBeGreaterThan(0);
    }
  });

  it.each(DIFFICULTIES)("returns the only legal move immediately at %s", (difficulty) => {
    expect(Position.fromFen(ONLY_ONE_MOVE).legalMoves()).toHaveLength(1);
    const result = search(ONLY_ONE_MOVE, difficulty);
    expect(result.move).toBe("a1b2");
    expect(result.timeMs).toBeLessThan(50);
  });

  it("throws when there are no legal moves", () => {
    expect(() => search(CHECKMATED, "medium")).toThrow();
  });

  it("throws on an illegal move in the history", () => {
    expect(() => search(START_FEN, "easy", ["e2e5"])).toThrow();
  });

  it("takes a repetition draw when it is losing", () => {
    const blackWithoutQueen = "rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const result = search(blackWithoutQueen, "hard", ["g1f3", "g8f6", "f3g1"]);
    expect(result.move).toBe("f6g8");
    expect(result.score).toBe(0);
  });

  it("scores a bare-kings-and-minor ending as a draw", () => {
    const result = search("4k3/8/8/8/8/8/8/2B1K3 w - - 0 1", "hard");
    expect(result.score).toBe(0);
  });
});

describe("findBestMove time control", () => {
  it("finishes every level under its budget in a busy middlegame on the real clock", () => {
    const timings = DIFFICULTIES.map((difficulty): number => {
      const result = findBestMove({ startFen: BUSY_MIDDLEGAME, moves: [], difficulty, seed: 7 });
      expect(isLegal(BUSY_MIDDLEGAME, [], result.move)).toBe(true);
      expect(result.timeMs).toBeLessThan(DIFFICULTY_SETTINGS[difficulty].hardTimeMs + 150);
      return result.timeMs;
    });
    expect(timings[3]).toBeLessThan(4500);
    timings.slice(1).forEach((time, index): void => expect(time).toBeGreaterThan(timings[index]));
  });

  it("aborts cleanly and still returns a legal move when the clock runs out immediately", () => {
    let ticks = 0;
    const exhaustedClock = (): number => {
      ticks += 1;
      return ticks === 1 ? 0 : 1_000_000;
    };
    const result = findBestMove({ startFen: KIWIPETE, moves: [], difficulty: "expert", seed: 1 }, exhaustedClock);
    expect(isLegal(KIWIPETE, [], result.move)).toBe(true);
  });
});

describe("findBestMove randomness", () => {
  it.each(NOISY_LEVELS)("is deterministic for a fixed seed at %s", (difficulty) => {
    const first = search(BUSY_MIDDLEGAME, difficulty, [], 42);
    const second = search(BUSY_MIDDLEGAME, difficulty, [], 42);
    expect(second.move).toBe(first.move);
    expect(second.score).toBe(first.score);
    expect(second.nodes).toBe(first.nodes);
  });

  it("varies its choices across seeds at easy", () => {
    const choices = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) choices.add(search(START_FEN, "easy", [], seed).move);
    expect(choices.size).toBeGreaterThan(1);
  });
});

describe("strength ordering", () => {
  const TEST_POSITIONS = [
    HANGING_QUEEN,
    POISONED_KNIGHT,
    BUSY_MIDDLEGAME,
    "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
    "r2qkb1r/ppp2ppp/2n1bn2/3pp3/4P3/2NP1N2/PPP1BPPP/R1BQK2R w KQkq - 0 6",
    "2r3k1/pp3ppp/4p3/3n4/3P4/P4N2/1P3PPP/2R3K1 b - - 0 25",
  ];

  /** Value of playing `uci`, judged by a reference search of the reply, capped so mates do not dominate. */
  const judge = (fen: string, uci: string): number => {
    const after = positionAfter(fen, [uci]);
    if (after.legalMoves().length === 0) return after.inCheck() ? 1500 : 0;
    const reply = findBestMove({ startFen: fen, moves: [uci], difficulty: "hard", seed: 1 }, fastClock(10));
    return Math.max(-1500, Math.min(1500, -reply.score));
  };

  it("expert's moves are judged at least as good as easy's on average", () => {
    let easyTotal = 0;
    let expertTotal = 0;
    TEST_POSITIONS.forEach((fen, index): void => {
      easyTotal += judge(fen, search(fen, "easy", [], index + 3).move);
      expertTotal += judge(fen, search(fen, "expert", [], index + 3).move);
    });
    expect(expertTotal / TEST_POSITIONS.length).toBeGreaterThanOrEqual(easyTotal / TEST_POSITIONS.length - 15);
  });

  it("expert beats easy, or is clearly ahead, in a short mini-match game", () => {
    const game = new Game();
    const moves: string[] = [];
    while (game.status().result === "*" && moves.length < 60) {
      const difficulty: Difficulty = game.position.turn === WHITE ? "expert" : "easy";
      const request: SearchRequest = { startFen: game.startFen, moves, difficulty, seed: moves.length };
      const result = findBestMove(request, fastClock(20));
      game.play(result.move);
      moves.push(result.move);
    }
    const status = game.status();
    if (status.result !== "*") {
      expect(status.result).toBe("1-0");
      return;
    }
    const whiteView = game.position.turn === WHITE ? evaluate(game.position) : -evaluate(game.position);
    expect(whiteView).toBeGreaterThan(200);
  });
});
