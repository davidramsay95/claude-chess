import { describe, expect, it } from "vitest";
import { Board } from "../src/engine/board.ts";
import { moveToUci } from "../src/engine/notation.ts";
import { chooseMove, DIFFICULTY_LIMITS } from "../src/engine/search.ts";

// Deterministic RNG so difficulty selection resolves to the best move.
const zero = (): number => 0;

describe("search finds strong moves", () => {
  it("plays a back-rank mate in one", () => {
    const board = Board.fromFen("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1");
    const result = chooseMove(board, DIFFICULTY_LIMITS.hard, zero);
    expect(result.bestMove && moveToUci(result.bestMove)).toBe("a1a8");
  });

  it("wins a hanging queen", () => {
    const board = Board.fromFen("4k3/8/8/8/3q4/8/8/3QK3 w - - 0 1");
    const result = chooseMove(board, DIFFICULTY_LIMITS.medium, zero);
    expect(result.bestMove && moveToUci(result.bestMove)).toBe("d1d4");
    expect(result.score).toBeGreaterThan(500);
  });

  it("returns a legal move at every level", () => {
    for (const level of ["easy", "medium", "hard", "expert"] as const) {
      const board = Board.fromFen(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      );
      const result = chooseMove(board, DIFFICULTY_LIMITS[level], zero);
      expect(result.bestMove).not.toBeNull();
    }
  });
});

describe("search respects its time budget", () => {
  it("answers well within five seconds at expert level", () => {
    const board = Board.fromFen(
      "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
    );
    const start = performance.now();
    const result = chooseMove(board, DIFFICULTY_LIMITS.expert, zero);
    const elapsed = performance.now() - start;
    expect(result.bestMove).not.toBeNull();
    expect(elapsed).toBeLessThan(5000);
  });
});
