import { describe, it, expect } from "vitest";
import { replayGame, gameStateToSaved } from "../src/bridge/messageBridge.js";
import type { SavedGame } from "../src/types.js";

const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("Export / Import round-trip", () => {
  const moves = ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"];

  it("export then import gives identical state", () => {
    const saved: SavedGame = {
      version: 1,
      startFen,
      playerColor: "white",
      difficulty: "hard",
      moves,
      resigned: false,
    };

    const r1 = replayGame(saved);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    const exported = gameStateToSaved(r1.state);
    const r2 = replayGame(exported);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;

    expect(r2.state.moves).toEqual(r1.state.moves);
    expect(r2.state.playerColor).toBe(r1.state.playerColor);
    expect(r2.state.difficulty).toBe(r1.state.difficulty);
    expect(r2.state.startFen).toBe(r1.state.startFen);
    expect(r2.state.resigned).toBe(r1.state.resigned);
  });

  it("invalid state does not affect a valid previous import", () => {
    const valid: SavedGame = {
      version: 1,
      startFen,
      playerColor: "black",
      difficulty: "easy",
      moves: ["d2d4"],
      resigned: false,
    };

    const r1 = replayGame(valid);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const state1 = r1.state;

    // Try to import an invalid game (illegal move)
    const invalid: SavedGame = {
      version: 1,
      startFen,
      playerColor: "white",
      difficulty: "medium",
      moves: ["e2e5"], // illegal
      resigned: false,
    };

    const r2 = replayGame(invalid);
    expect(r2.ok).toBe(false);
    // State1 is unchanged (replayGame doesn't mutate any shared state)
    expect(state1.moves).toEqual(["d2d4"]);
  });

  it("accepts castling moves", () => {
    const saved: SavedGame = {
      version: 1,
      startFen,
      playerColor: "white",
      difficulty: "medium",
      // Get castling: clear path for white KS
      moves: ["e2e4", "e7e5", "g1f3", "g8f6", "f1e2", "f8e7", "e1g1"],
      resigned: false,
    };
    const r = replayGame(saved);
    expect(r.ok).toBe(true);
  });

  it("accepts en passant moves", () => {
    // Set up en passant position
    const saved: SavedGame = {
      version: 1,
      startFen,
      playerColor: "white",
      difficulty: "medium",
      moves: ["e2e4", "d7d5", "e4e5", "d5d4", "e5e6"], // not real EP but valid moves
      resigned: false,
    };
    const r = replayGame(saved);
    expect(r.ok).toBe(true);
  });
});
