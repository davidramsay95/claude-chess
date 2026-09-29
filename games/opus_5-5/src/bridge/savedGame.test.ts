import { describe, expect, it } from "vitest";
import { parseSavedGame, summarizeSavedGame, type SavedGame } from "./savedGame";

const game = (overrides: Partial<SavedGame> = {}): SavedGame => ({
  humanColor: "w",
  difficulty: "medium",
  moves: [],
  resigned: false,
  ...overrides,
});

describe("summarizeSavedGame", () => {
  it("reports an unfinished game as * with the half-move count", () => {
    expect(summarizeSavedGame(game({ moves: ["e2e4", "e7e5"] }))).toEqual({ result: "*", moveCount: 2 });
  });

  it("reports fool's mate as a black win", () => {
    const moves = ["f2f3", "e7e5", "g2g4", "d8h4"];
    expect(summarizeSavedGame(game({ moves }))).toEqual({ result: "0-1", moveCount: 4 });
  });

  it("reports a resignation as a win for the engine", () => {
    expect(summarizeSavedGame(game({ resigned: true, moves: ["e2e4"] })).result).toBe("0-1");
    expect(summarizeSavedGame(game({ humanColor: "b", resigned: true })).result).toBe("1-0");
  });
});

describe("parseSavedGame", () => {
  it("round-trips a valid state", () => {
    const saved = game({ moves: ["e2e4"], difficulty: "hard", humanColor: "b" });
    expect(parseSavedGame(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it.each([
    ["not an object", 42],
    ["null", null],
    ["bad colour", { ...game(), humanColor: "x" }],
    ["bad difficulty", { ...game(), difficulty: "godlike" }],
    ["moves not an array", { ...game(), moves: "e2e4" }],
    ["resigned not a boolean", { ...game(), resigned: "yes" }],
    ["an illegal move", { ...game(), moves: ["e2e5"] }],
  ])("rejects %s", (_name, value) => {
    expect(() => parseSavedGame(value)).toThrow(Error);
  });
});
