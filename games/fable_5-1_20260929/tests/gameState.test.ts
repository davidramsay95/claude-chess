import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Game } from "../src/engine/game";
import type { LiveGame, SavedGameState } from "../src/state/contracts";
import { exportGameState, importGameState, serializeGameState, summaryOf } from "../src/state/gameState";

const sample = JSON.parse(readFileSync(new URL("../../../game_state.json", import.meta.url), "utf8")) as SavedGameState;

const liveFrom = (moves: string[], playerColor: "white" | "black" = "white"): LiveGame => {
  const game = Game.fromStart();
  for (const uci of moves) {
    if (!game.playUci(uci)) throw new Error(`Test setup: ${uci} is not legal`);
  }
  return { game, playerColor, difficulty: "hard" };
};

const expectFailure = (input: unknown, fragment: string): void => {
  const result = importGameState(input);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toContain(fragment);
};

describe("exportGameState", () => {
  it("produces the game_state.json shape for the fool's mate", () => {
    const live: LiveGame = { ...liveFrom(["f2f3", "e7e5", "g2g4", "d8h4"]), difficulty: "medium" };
    expect(exportGameState(live)).toEqual(sample);
  });

  it("marks a resigned game", () => {
    const live = liveFrom(["e2e4"], "black");
    live.game.resign("black");
    expect(exportGameState(live).resigned).toBe(true);
  });

  it("serializes with the exact key order of game_state.json", () => {
    const live: LiveGame = { ...liveFrom(["f2f3", "e7e5", "g2g4", "d8h4"]), difficulty: "medium" };
    const text = serializeGameState(exportGameState(live));
    expect(JSON.parse(text)).toEqual(sample);
    expect(Object.keys(JSON.parse(text) as object)).toEqual([
      "version",
      "startFen",
      "playerColor",
      "difficulty",
      "moves",
      "resigned",
    ]);
    expect(text).toContain("\n  \"version\": 1,\n");
  });
});

describe("summaryOf", () => {
  it("reports the result and half-move count", () => {
    const live = liveFrom(["f2f3", "e7e5", "g2g4", "d8h4"]);
    expect(summaryOf(live.game)).toEqual({ result: "0-1", moveCount: 4 });
    expect(summaryOf(Game.fromStart())).toEqual({ result: "*", moveCount: 0 });
  });
});

describe("importGameState round trips", () => {
  it("restores an identical state from the sample", () => {
    const result = importGameState(sample);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(exportGameState(result.value)).toEqual(sample);
    expect(result.value.game.result()).toBe("0-1");
    expect(result.value.game.plyCount()).toBe(4);
    expect(result.value.playerColor).toBe("white");
    expect(result.value.difficulty).toBe("medium");
  });

  it("accepts the serialized JSON text", () => {
    const text = serializeGameState(sample);
    const result = importGameState(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(exportGameState(result.value)).toEqual(sample);
  });

  it("round-trips castling and promotion", () => {
    const game = Game.fromFen("r3k2r/6P1/8/8/8/8/8/R3K2R w KQkq - 0 1");
    for (const uci of ["e1g1", "e8c8", "g7g8q"]) {
      expect(game.playUci(uci)).toBe(true);
    }
    const live: LiveGame = { game, playerColor: "black", difficulty: "expert" };
    const saved = exportGameState(live);
    const result = importGameState(saved);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(exportGameState(result.value)).toEqual(saved);
    expect(result.value.game.fen()).toBe(game.fen());
    expect(result.value.game.sanHistory()).toEqual(["O-O", "O-O-O", "g8=Q"]);
  });

  it("round-trips a resigned game and applies the resignation to the player", () => {
    const live = liveFrom(["e2e4", "e7e5"], "black");
    live.game.resign("black");
    const saved = exportGameState(live);
    const result = importGameState(saved);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.game.hasResigned()).toBe(true);
    expect(result.value.game.result()).toBe("1-0");
    expect(exportGameState(result.value)).toEqual(saved);
  });

  it("ignores unknown extra fields", () => {
    const result = importGameState({ ...sample, note: "hello" });
    expect(result.ok).toBe(true);
  });
});

describe("importGameState rejects invalid states", () => {
  it("leaves an existing game untouched on failure", () => {
    const live = liveFrom(["e2e4", "e7e5", "g1f3"]);
    const before = exportGameState(live);
    const result = importGameState({ ...sample, moves: ["f2f3", "e7e5", "g2g5"] });
    expect(result.ok).toBe(false);
    expect(exportGameState(live)).toEqual(before);
    expect(live.game.fen()).toBe("rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2");
  });

  it("names the illegal move", () => {
    const result = importGameState({ ...sample, moves: ["f2f3", "e7e5", "g2g5"] });
    expect(result).toEqual({ ok: false, error: "Move 3 (g2g5) is not legal" });
  });

  it("rejects a move after checkmate", () => {
    expectFailure({ ...sample, moves: [...sample.moves, "e1f2"] }, "Move 5 (e1f2)");
  });

  it("rejects malformed UCI", () => {
    expectFailure({ ...sample, moves: ["e2e4", "e7e5x"] }, "Move 2 (e7e5x)");
    expectFailure({ ...sample, moves: ["e2e4", 5] }, "Move 2");
  });

  it("rejects the wrong version", () => {
    expectFailure({ ...sample, version: 2 }, "version");
    expectFailure({ ...sample, version: "1" }, "version");
  });

  it("rejects missing fields", () => {
    const { moves: _moves, ...noMoves } = sample;
    expectFailure(noMoves, "moves");
    const { startFen: _fen, ...noFen } = sample;
    expectFailure(noFen, "startFen");
    const { resigned: _resigned, ...noResigned } = sample;
    expectFailure(noResigned, "resigned");
    const { playerColor: _color, ...noColor } = sample;
    expectFailure(noColor, "playerColor");
    const { difficulty: _difficulty, ...noDifficulty } = sample;
    expectFailure(noDifficulty, "difficulty");
  });

  it("rejects a bad FEN", () => {
    expectFailure({ ...sample, startFen: "not a fen" }, "startFen");
    expectFailure({ ...sample, startFen: 42 }, "startFen");
  });

  it("rejects a bad player colour", () => {
    expectFailure({ ...sample, playerColor: "red" }, "playerColor");
  });

  it("rejects a bad difficulty", () => {
    expectFailure({ ...sample, difficulty: "impossible" }, "difficulty");
  });

  it("rejects non-array moves", () => {
    expectFailure({ ...sample, moves: "e2e4" }, "moves");
  });

  it("rejects a non-boolean resigned flag", () => {
    expectFailure({ ...sample, resigned: "yes" }, "resigned");
  });

  it("rejects invalid JSON text", () => {
    expectFailure("{ not json", "JSON");
  });

  it("rejects non-object input", () => {
    expectFailure(null, "object");
    expectFailure(7, "object");
    expectFailure([sample], "object");
  });
});
