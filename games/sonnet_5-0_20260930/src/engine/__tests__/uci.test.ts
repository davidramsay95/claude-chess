import { describe, expect, it } from "vitest";
import { createGame, getLegalMoves, moveToUci, uciToMove } from "../index";
import type { Move } from "../types";

describe("UCI round-trip", () => {
  it("agrees for ordinary moves", () => {
    const move: Move = { from: "e2", to: "e4" };
    const uci = moveToUci(move);
    expect(uci).toBe("e2e4");
    expect(uciToMove(createGame(), uci)).toEqual(move);
  });

  it("agrees for castling, expressed as a king two-square move", () => {
    const state = createGame(
      "r3kbnr/pppqpppp/2n5/3p1b2/3P1B2/2N5/PPPQPPPP/R3KBNR w KQkq -",
    );
    const move: Move = { from: "e1", to: "c1" };
    const uci = moveToUci(move);
    expect(uci).toBe("e1c1");
    expect(uciToMove(state, uci)).toEqual(move);
  });

  it("agrees for promotion moves", () => {
    const state = createGame("8/P7/8/8/8/8/8/k1K5 w - -");
    const move: Move = { from: "a7", to: "a8", promotion: "q" };
    const uci = moveToUci(move);
    expect(uci).toBe("a7a8q");
    expect(uciToMove(state, uci)).toEqual(move);
  });

  it("round-trips every legal move from the starting position", () => {
    const state = createGame();
    for (const move of getLegalMoves(state)) {
      const uci = moveToUci(move);
      expect(uciToMove(state, uci)).toEqual(move);
    }
  });

  it("returns null for malformed UCI strings", () => {
    const state = createGame();
    expect(uciToMove(state, "")).toBeNull();
    expect(uciToMove(state, "e2")).toBeNull();
    expect(uciToMove(state, "z9z9")).toBeNull();
    expect(uciToMove(state, "e2e4x")).toBeNull();
  });

  it("returns null when there is no piece of the side to move on the from-square", () => {
    const state = createGame();
    // e7 has a black pawn, but it's white to move.
    expect(uciToMove(state, "e7e5")).toBeNull();
  });
});
