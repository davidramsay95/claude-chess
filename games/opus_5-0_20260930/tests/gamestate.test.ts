import { describe, it, expect } from "vitest";
import { Game } from "../src/engine/game.ts";
import { START_FEN } from "../src/engine/position.ts";
import {
  exportState,
  loadState,
  parseState,
  serializeState,
  summarise,
  type SavedGameState,
} from "../src/engine/gamestate.ts";

const FOOLS_MATE: SavedGameState = {
  version: 1,
  startFen: START_FEN,
  playerColor: "white",
  difficulty: "medium",
  moves: ["f2f3", "e7e5", "g2g4", "d8h4"],
  resigned: false,
};

describe("export", () => {
  it("produces exactly the documented shape", () => {
    const game = new Game();
    for (const uci of FOOLS_MATE.moves) game.playUci(uci);
    const state = exportState(game, "white", "medium");
    expect(state).toEqual(FOOLS_MATE);
    expect(Object.keys(state)).toEqual([
      "version",
      "startFen",
      "playerColor",
      "difficulty",
      "moves",
      "resigned",
    ]);
  });

  it("summarises the result and the half-move count", () => {
    const game = new Game();
    expect(summarise(new Game())).toEqual({ result: "*", moveCount: 0 });
    for (const uci of FOOLS_MATE.moves) game.playUci(uci);
    expect(summarise(game)).toEqual({ result: "0-1", moveCount: 4 });
  });

  it("records a resignation", () => {
    const game = new Game();
    game.playUci("e2e4");
    game.resign("black");
    const state = exportState(game, "black", "expert");
    expect(state.resigned).toBe(true);
    expect(summarise(game)).toEqual({ result: "1-0", moveCount: 1 });
  });
});

describe("import", () => {
  it("round-trips an exported state exactly", () => {
    const loaded = loadState(FOOLS_MATE);
    expect(loaded.playerColor).toBe("white");
    expect(loaded.difficulty).toBe("medium");
    expect(loaded.game.uciMoves()).toEqual(FOOLS_MATE.moves);
    expect(loaded.game.status().result).toBe("0-1");
    expect(exportState(loaded.game, loaded.playerColor, loaded.difficulty)).toEqual(FOOLS_MATE);
  });

  it("round-trips through the serialised text form", () => {
    const text = serializeState(FOOLS_MATE);
    expect(JSON.parse(text)).toEqual(FOOLS_MATE);
    const loaded = loadState(text);
    expect(exportState(loaded.game, loaded.playerColor, loaded.difficulty)).toEqual(FOOLS_MATE);
  });

  it("restores a resigned game", () => {
    const loaded = loadState({ ...FOOLS_MATE, moves: ["e2e4"], resigned: true, playerColor: "black" });
    expect(loaded.game.status()).toMatchObject({ over: true, reason: "resignation", result: "1-0" });
  });

  it("restores a game that started from a non-standard position", () => {
    const fen = "4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1";
    const loaded = loadState({ ...FOOLS_MATE, startFen: fen, moves: ["e1g1"] });
    expect(loaded.game.moves[0].san).toBe("O-O");
  });

  it("keeps the whole move list so the user can step back through it", () => {
    const loaded = loadState(FOOLS_MATE);
    expect(loaded.game.moves.map((m) => m.san)).toEqual(["f3", "e5", "g4", "Qh4#"]);
  });
});

describe("validation", () => {
  const cases: Array<[string, unknown, RegExp]> = [
    ["null", null, /object/i],
    ["a number", 7, /object/i],
    ["unparseable text", "{not json", /json/i],
    ["a missing version", { ...FOOLS_MATE, version: undefined }, /version/i],
    ["a future version", { ...FOOLS_MATE, version: 2 }, /version/i],
    ["a bad player colour", { ...FOOLS_MATE, playerColor: "green" }, /playerColor/],
    ["a bad difficulty", { ...FOOLS_MATE, difficulty: "insane" }, /difficulty/],
    ["a non-array move list", { ...FOOLS_MATE, moves: "e2e4" }, /moves/],
    ["a non-string move", { ...FOOLS_MATE, moves: [1234] }, /Move 1/],
    ["a non-boolean resigned", { ...FOOLS_MATE, resigned: "yes" }, /resigned/],
    ["a broken start FEN", { ...FOOLS_MATE, startFen: "not a fen" }, /startFen/],
    ["an illegal move", { ...FOOLS_MATE, moves: ["f2f3", "e7e5", "g2g5"] }, /Move 3 \(g2g5\)/],
    ["a move after checkmate", { ...FOOLS_MATE, moves: [...FOOLS_MATE.moves, "a2a3"] }, /Move 5/],
  ];

  it.each(cases)("rejects %s", (_name, input, pattern) => {
    expect(() => loadState(input)).toThrow(pattern);
    expect(() => parseState(input)).toThrow(pattern);
  });

  it("never mutates the caller's object", () => {
    const original = structuredClone(FOOLS_MATE);
    loadState(FOOLS_MATE);
    expect(FOOLS_MATE).toEqual(original);
  });

  it("returns a fresh Game so a failed load cannot touch the live one", () => {
    const live = new Game();
    live.playUci("d2d4");
    const before = live.position.toFen();
    expect(() => loadState({ ...FOOLS_MATE, moves: ["e2e5"] })).toThrow();
    expect(live.position.toFen()).toBe(before);
    const loaded = loadState(FOOLS_MATE);
    expect(loaded.game).not.toBe(live);
    expect(live.position.toFen()).toBe(before);
  });
});
