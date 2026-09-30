import { describe, expect, it } from "vitest";
import { createGame, getStatus, getWinner, makeMove } from "../index";
import type { GameState } from "../types";

function playUci(state: GameState, moves: string[]): GameState {
  let current = state;
  for (const uci of moves) {
    const move = {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length === 5 ? { promotion: uci[4] as "q" | "r" | "b" | "n" } : {}),
    };
    const result = makeMove(current, move);
    if (!result) throw new Error(`Illegal move ${uci} in sequence`);
    current = result.state;
  }
  return current;
}

describe("checkmate detection", () => {
  it("detects Fool's Mate", () => {
    const state = playUci(createGame(), ["f2f3", "e7e5", "g2g4", "d8h4"]);
    expect(getStatus(state)).toBe("checkmate");
    expect(getWinner(state)).toBe("black");
  });

  it("detects Scholar's Mate", () => {
    const state = playUci(createGame(), [
      "e2e4",
      "e7e5",
      "f1c4",
      "b8c6",
      "d1h5",
      "g8f6",
      "h5f7",
    ]);
    expect(getStatus(state)).toBe("checkmate");
    expect(getWinner(state)).toBe("white");
  });
});

describe("stalemate detection", () => {
  it("detects a known stalemate position", () => {
    // Classic stalemate: black king boxed in on a8 with no legal moves and
    // not in check.
    const state = createGame("k7/8/1Q6/8/8/8/8/7K b - -");
    expect(getStatus(state)).toBe("stalemate");
    expect(getWinner(state)).toBeNull();
  });
});
