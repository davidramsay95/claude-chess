import { describe, expect, it } from "vitest";
import { createGame, getLegalMoves, moveToUci } from "../../engine/index";
import { findBestMove } from "../index";
import { getDifficultyConfig, type Difficulty } from "../difficulty";
import { iterativeDeepeningSearch } from "../search";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "expert"];

describe("findBestMove sanity", () => {
  for (const difficulty of DIFFICULTIES) {
    it(`always returns a legal move at ${difficulty} difficulty`, () => {
      const state = createGame();
      const legal = new Set(getLegalMoves(state).map((m) => moveToUci(m)));
      const move = findBestMove(state, difficulty, 300);
      expect(legal.has(moveToUci(move))).toBe(true);
    });
  }

  it("respects a short time budget without hanging, even at expert", () => {
    const state = createGame();
    const start = Date.now();
    const move = findBestMove(state, "expert", 200);
    const elapsed = Date.now() - start;
    expect(move).toBeDefined();
    // Generous ceiling: the deadline check happens every 512 nodes, so a
    // single slow node batch could overshoot slightly, but it must not
    // balloon into a multi-second hang.
    expect(elapsed).toBeLessThan(3000);
  });

  it("returns a legal move in a tactical middlegame position at every difficulty", () => {
    const fen = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq -";
    const state = createGame(fen);
    const legal = new Set(getLegalMoves(state).map((m) => moveToUci(m)));
    for (const difficulty of DIFFICULTIES) {
      const move = findBestMove(state, difficulty, 300);
      expect(legal.has(moveToUci(move))).toBe(true);
    }
  });

  it("throws when there are no legal moves (checkmate/stalemate position)", () => {
    // Fool's Mate final position: black to move is not relevant here since
    // findBestMove would be asked to move for the side that has just been
    // mated; use a stalemate position instead where it's the side-to-move
    // that has no moves.
    const stalemate = createGame("k7/8/1Q6/8/8/8/8/7K b - -");
    expect(() => findBestMove(stalemate, "easy", 200)).toThrow();
  });
});

describe("difficulty scales search effort", () => {
  it("visits more nodes at higher difficulty given the same generous time budget", () => {
    const state = createGame();
    const easyResult = iterativeDeepeningSearch(state, getDifficultyConfig("easy"), 2000);
    const expertResult = iterativeDeepeningSearch(state, getDifficultyConfig("expert"), 2000);
    expect(expertResult.depthReached).toBeGreaterThan(easyResult.depthReached);
    expect(expertResult.nodes).toBeGreaterThan(easyResult.nodes);
  });
});
