import { describe, it, expect } from "vitest";
import { exportState, importState } from "../src/state.js";

describe("state export/import", () => {
  it("exports the initial saved state as expected", () => {
    const { game } = importState({
      version: 1,
      startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      playerColor: "white",
      difficulty: "medium",
      moves: [],
      resigned: false,
    });
    const s = exportState(game, "white", "medium");
    expect(s.version).toBe(1);
    expect(s.moves).toEqual([]);
    expect(s.resigned).toBe(false);
  });

  it("round-trips fools mate identically", () => {
    const original = {
      version: 1,
      startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      playerColor: "white" as const,
      difficulty: "medium" as const,
      moves: ["f2f3", "e7e5", "g2g4", "d8h4"],
      resigned: false,
    };
    const { game } = importState(original);
    const back = exportState(game, "white", "medium");
    expect(back).toEqual(original);
    expect(game.endState().over).toBe(true);
    expect(game.endState().reason).toBe("checkmate");
  });

  it("rejects unsupported version", () => {
    expect(() => importState({ version: 2, moves: [] })).toThrow(/version/i);
  });

  it("rejects illegal moves", () => {
    expect(() => importState({
      version: 1,
      startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      playerColor: "white",
      difficulty: "medium",
      moves: ["e2e5"],
      resigned: false,
    })).toThrow(/e2e5.*legal/);
  });

  it("rejects missing fields", () => {
    expect(() => importState({ version: 1, moves: [] })).toThrow();
    expect(() => importState({ version: 1, startFen: "x", playerColor: "white", difficulty: "medium", moves: [] })).toThrow();
  });

  it("rejects non-object input", () => {
    expect(() => importState(null)).toThrow();
    expect(() => importState("not-json")).toThrow();
  });

  it("import failure leaves no partial state (throws before mutating anything external)", () => {
    // The interface contract: importState throws, callers keep their current game.
    const before = {
      version: 1,
      startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      playerColor: "white" as const,
      difficulty: "medium" as const,
      moves: ["e2e4"],
      resigned: false,
    };
    const { game } = importState(before);
    const fen = game.fen();
    // Now try a bad import.
    expect(() => importState({ ...before, moves: ["e2e4", "z9z9"] })).toThrow();
    // Original game is untouched.
    expect(game.fen()).toBe(fen);
  });
});
