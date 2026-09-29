import { describe, expect, it } from "vitest";
import { Game } from "../src/engine/game";
import { moveToUci } from "../src/engine/move";
import type { Difficulty } from "../src/engine/protocol";
import { findBestMove } from "../src/engine/search";

const QUIET_MIDDLEGAME = "r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P4/2PBPN2/PP1N1PPP/R2QK2R w KQ - 0 8";
const MATE_IN_ONE = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
const MATE_IN_TWO = "7k/8/8/8/8/8/8/RR5K w - - 0 1";
const LEVELS: Difficulty[] = ["easy", "medium", "hard", "expert"];

const seededRandom = (seed: number): (() => number) => {
  let state = seed | 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10000) / 10000;
  };
};

describe("findBestMove with no legal moves", () => {
  it("returns null in a checkmated position", () => {
    const game = Game.fromFen("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3");
    const result = findBestMove(game, { difficulty: "hard" });
    expect(result.move).toBeNull();
    expect(result.uci).toBeNull();
  });

  it("returns null once the human has resigned", () => {
    const game = Game.fromStart();
    game.resign("white");
    expect(findBestMove(game, { difficulty: "easy" }).uci).toBeNull();
  });
});

describe("mates", () => {
  it.each(["medium", "hard", "expert"] as Difficulty[])("%s finds mate in one", (difficulty) => {
    const result = findBestMove(Game.fromFen(MATE_IN_ONE), { difficulty });
    expect(result.uci).toBe("a1a8");
    expect(result.score).toBeGreaterThan(90000);
  });

  it.each(["hard", "expert"] as Difficulty[])("%s finds mate in two", (difficulty) => {
    const result = findBestMove(Game.fromFen(MATE_IN_TWO), { difficulty });
    expect(["a1a7", "b1b7"]).toContain(result.uci);
    expect(result.score).toBeGreaterThan(90000);
  });
});

describe("material sense", () => {
  it("medium captures a free queen", () => {
    const result = findBestMove(Game.fromFen("4k3/8/8/8/8/8/8/q2RK3 w - - 0 1"), { difficulty: "medium" });
    expect(result.uci).toBe("d1a1");
  });

  it("medium does not leave its queen hanging to a rook", () => {
    const result = findBestMove(Game.fromFen("4k3/8/8/3r4/8/8/8/3QK3 w - - 0 1"), { difficulty: "medium" });
    expect(result.uci).toBe("d1d5");
  });
});

describe("difficulty levels", () => {
  const results = new Map<Difficulty, ReturnType<typeof findBestMove>>();
  const timings = new Map<Difficulty, number>();
  for (const difficulty of LEVELS) {
    const game = Game.fromFen(QUIET_MIDDLEGAME);
    const started = performance.now();
    results.set(difficulty, findBestMove(game, { difficulty, random: seededRandom(7) }));
    timings.set(difficulty, performance.now() - started);
  }

  it.each(LEVELS)("%s replies within five seconds with a legal move", (difficulty) => {
    expect(timings.get(difficulty)).toBeLessThan(5000);
    const legal = new Set(Game.fromFen(QUIET_MIDDLEGAME).legalMoves().map(moveToUci));
    expect(legal.has(results.get(difficulty)?.uci ?? "")).toBe(true);
  });

  it("searches strictly deeper at each level from medium upward", () => {
    const medium = results.get("medium")?.depth ?? 0;
    const hard = results.get("hard")?.depth ?? 0;
    const expert = results.get("expert")?.depth ?? 0;
    expect(hard).toBeGreaterThan(medium);
    expect(expert).toBeGreaterThan(hard);
  });

  it("expert respects a time override", () => {
    const started = performance.now();
    const result = findBestMove(Game.fromFen(QUIET_MIDDLEGAME), { difficulty: "expert", maxTimeMs: 300 });
    expect(performance.now() - started).toBeLessThan(900);
    expect(result.uci).not.toBeNull();
  });

  it("easy picks a legal move with a seeded random source", () => {
    const game = Game.fromFen(QUIET_MIDDLEGAME);
    const legal = new Set(game.legalMoves().map(moveToUci));
    for (let seed = 1; seed <= 5; seed++) {
      const result = findBestMove(game, { difficulty: "easy", random: seededRandom(seed) });
      expect(legal.has(result.uci ?? "")).toBe(true);
    }
  });

  it("easy avoids walking into mate in one when it can", () => {
    // Black to move facing Ra8#. Only a luft (pawn move) or Kf8 stops it.
    const game = Game.fromFen("6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1");
    for (let seed = 1; seed <= 5; seed++) {
      const result = findBestMove(game, { difficulty: "easy", random: seededRandom(seed) });
      expect(["h7h6", "h7h5", "g7g6", "g7g5", "f7f6", "f7f5", "g8f8"]).toContain(result.uci);
    }
  });
});

describe("repetition awareness", () => {
  it("does not repeat a position for the third time while clearly winning", () => {
    const game = Game.fromFen("4k3/8/8/8/8/8/8/K2Q4 w - - 0 1");
    for (const uci of ["d1d2", "e8e7", "d2d1", "e7e8", "d1d2", "e8f8", "d2c2", "f8e8"]) {
      expect(game.playUci(uci)).toBe(true);
    }
    // Qc2-d2 would reproduce the position after 1.Qd2 and 3.Qd2 for a third time.
    for (const difficulty of ["medium", "hard", "expert"] as Difficulty[]) {
      const result = findBestMove(game, { difficulty, maxTimeMs: 500 });
      expect(result.uci).not.toBe("c2d2");
      expect(result.uci).not.toBeNull();
    }
  });
});
