import { describe, expect, test } from "vitest";
import { START_FEN } from "../src/engine/board";
import {
  applyUci,
  createGame,
  exportState,
  gameSummary,
  importState
} from "../src/state";

const FOOLS_MATE = ["f2f3", "e7e5", "g2g4", "d8h4"];

describe("export", () => {
  test("a fresh game exports the documented shape", () => {
    const game = createGame("white", "medium");
    expect(exportState(game)).toEqual({
      version: 1,
      startFen: START_FEN,
      playerColor: "white",
      difficulty: "medium",
      moves: [],
      resigned: false
    });
  });

  test("played moves appear in order as UCI strings", () => {
    const game = createGame("white", "easy");
    for (const uci of FOOLS_MATE) applyUci(game, uci);
    expect(exportState(game).moves).toEqual(FOOLS_MATE);
  });
});

describe("summary", () => {
  test("an unfinished game reports * and the halfmove count", () => {
    const game = createGame("black", "hard");
    applyUci(game, "e2e4");
    expect(gameSummary(game)).toEqual({ result: "*", moveCount: 1 });
  });

  test("fool's mate reports a black win", () => {
    const game = createGame("white", "medium");
    for (const uci of FOOLS_MATE) applyUci(game, uci);
    expect(gameSummary(game)).toEqual({ result: "0-1", moveCount: 4 });
  });

  test("resignation reports a win for the engine", () => {
    const game = createGame("white", "medium");
    game.resigned = true;
    expect(gameSummary(game).result).toBe("0-1");
    const asBlack = createGame("black", "medium");
    asBlack.resigned = true;
    expect(gameSummary(asBlack).result).toBe("1-0");
  });

  test("stalemate reports a draw", () => {
    const game = createGame("white", "expert", "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(gameSummary(game).result).toBe("1/2-1/2");
  });
});

describe("import", () => {
  test("export then import round-trips exactly", () => {
    const game = createGame("black", "expert");
    for (const uci of ["d2d4", "g8f6", "c2c4"]) applyUci(game, uci);
    const saved = exportState(game);
    const restored = importState(saved);
    expect(exportState(restored)).toEqual(saved);
    expect(restored.board.toFen()).toBe(game.board.toFen());
  });

  test("import accepts a finished game", () => {
    const saved = {
      version: 1,
      startFen: START_FEN,
      playerColor: "white",
      difficulty: "medium",
      moves: FOOLS_MATE,
      resigned: false
    };
    const restored = importState(saved);
    expect(restored.board.status()).toBe("checkmate");
    expect(restored.sans).toEqual(["f3", "e5", "g4", "Qh4#"]);
  });

  test.each([
    [null, "not an object"],
    ["text", "a plain string"],
    [{}, "an empty object"],
    [{ version: 2, startFen: START_FEN, playerColor: "white", difficulty: "easy", moves: [], resigned: false }, "wrong version"],
    [{ version: 1, startFen: START_FEN, playerColor: "green", difficulty: "easy", moves: [], resigned: false }, "bad colour"],
    [{ version: 1, startFen: START_FEN, playerColor: "white", difficulty: "impossible", moves: [], resigned: false }, "bad difficulty"],
    [{ version: 1, startFen: "junk", playerColor: "white", difficulty: "easy", moves: [], resigned: false }, "bad FEN"],
    [{ version: 1, startFen: START_FEN, playerColor: "white", difficulty: "easy", moves: "e2e4", resigned: false }, "moves not an array"],
    [{ version: 1, startFen: START_FEN, playerColor: "white", difficulty: "easy", moves: [42], resigned: false }, "move not a string"],
    [{ version: 1, startFen: START_FEN, playerColor: "white", difficulty: "easy", moves: [], resigned: "no" }, "resigned not boolean"]
  ])("rejects invalid state %#: %s", (bad, _label) => {
    expect(() => importState(bad)).toThrow();
  });

  test("rejects an illegal move with a message naming it", () => {
    const saved = {
      version: 1,
      startFen: START_FEN,
      playerColor: "white",
      difficulty: "medium",
      moves: ["e2e4", "e7e5", "g2g5"],
      resigned: false
    };
    expect(() => importState(saved)).toThrow(/g2g5/);
  });

  test("rejects moves played after the game has ended", () => {
    const saved = {
      version: 1,
      startFen: START_FEN,
      playerColor: "white",
      difficulty: "medium",
      moves: [...FOOLS_MATE, "a2a3"],
      resigned: false
    };
    expect(() => importState(saved)).toThrow(/a2a3/);
  });
});
