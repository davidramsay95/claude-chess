import { describe, expect, it } from "vitest";
import { Game } from "../core/game";
import { BLACK, START_FEN, WHITE } from "../core/position";
import {
  MAX_MOVES,
  buildGameState,
  parseGameState,
  parseGameStateText,
  serializeGameState,
  summarize,
  type GameStateV1,
  type ParseOutcome,
} from "./gameState";

const FOOLS_MATE: GameStateV1 = {
  version: 1,
  startFen: START_FEN,
  playerColor: "white",
  difficulty: "medium",
  moves: ["f2f3", "e7e5", "g2g4", "d8h4"],
  resigned: false,
};

const withField = (field: string, value: unknown): Record<string, unknown> => ({ ...FOOLS_MATE, [field]: value });

const withoutField = (field: string): Record<string, unknown> => {
  const copy: Record<string, unknown> = { ...FOOLS_MATE };
  delete copy[field];
  return copy;
};

const expectError = (outcome: ParseOutcome): string => {
  if (outcome.ok) throw new Error("Expected the state to be rejected");
  return outcome.error;
};

const expectLoaded = (outcome: ParseOutcome): Extract<ParseOutcome, { ok: true }>["loaded"] => {
  if (!outcome.ok) throw new Error(`Expected the state to load, got: ${outcome.error}`);
  return outcome.loaded;
};

describe("parseGameState", () => {
  it("loads the fool's mate example and replays it to a black win", () => {
    const loaded = expectLoaded(parseGameState(FOOLS_MATE));
    expect(loaded.state).toEqual(FOOLS_MATE);
    expect(loaded.game.moves.map((move) => move.uci)).toEqual(FOOLS_MATE.moves);
    expect(summarize(loaded.game)).toEqual({ result: "0-1", moveCount: 4 });
  });

  it("accepts the shipped example file shape with extra fields ignored", () => {
    const loaded = expectLoaded(parseGameState({ ...FOOLS_MATE, note: "hello", extra: [1, 2] }));
    expect(loaded.state).toEqual(FOOLS_MATE);
    expect(Object.keys(loaded.state).sort()).toEqual(
      ["difficulty", "moves", "playerColor", "resigned", "startFen", "version"],
    );
  });

  it("accepts any valid FEN and normalises it through the game", () => {
    const loaded = expectLoaded(
      parseGameState({ ...FOOLS_MATE, startFen: "4k3/8/8/8/8/8/8/4K2R w K -", moves: ["e1g1"] }),
    );
    expect(loaded.state.startFen).toBe("4k3/8/8/8/8/8/8/4K2R w K - 0 1");
    expect(loaded.game.position.toFen()).toBe("4k3/8/8/8/8/8/8/5RK1 b - - 1 1");
  });

  it("does not alias the input moves array", () => {
    const input = { ...FOOLS_MATE, moves: [...FOOLS_MATE.moves] };
    const loaded = expectLoaded(parseGameState(input));
    input.moves.push("a2a3");
    expect(loaded.state.moves).toHaveLength(4);
  });

  it.each([
    ["null", null],
    ["an array", [FOOLS_MATE]],
    ["a string", "{}"],
    ["a number", 1],
    ["undefined", undefined],
  ])("rejects %s as the whole state", (_label, input) => {
    expect(expectError(parseGameState(input))).toBe("Saved game must be a JSON object");
  });

  it.each([2, 0, "1", null, undefined])("rejects version %s", (version) => {
    expect(expectError(parseGameState(withField("version", version)))).toBe("Unsupported save version (expected 1)");
  });

  it("rejects a missing version", () => {
    expect(expectError(parseGameState(withoutField("version")))).toBe("Unsupported save version (expected 1)");
  });

  it.each([42, null, undefined])("rejects a non-string startFen (%s)", (startFen) => {
    expect(expectError(parseGameState(withField("startFen", startFen)))).toBe("startFen must be a string");
  });

  it("rejects an invalid FEN with the parser's reason", () => {
    expect(expectError(parseGameState(withField("startFen", "not a fen")))).toBe(
      "startFen is invalid: FEN must have 4 or 6 fields",
    );
    expect(expectError(parseGameState(withField("startFen", "8/8/8/8/8/8/8/8 w - - 0 1")))).toBe(
      "startFen is invalid: FEN must have exactly one king per side",
    );
  });

  it.each(["White", "red", 0, null, undefined])("rejects playerColor %s", (playerColor) => {
    expect(expectError(parseGameState(withField("playerColor", playerColor)))).toBe(
      'playerColor must be "white" or "black"',
    );
  });

  it.each(["impossible", "Medium", 3, null, undefined])("rejects difficulty %s", (difficulty) => {
    expect(expectError(parseGameState(withField("difficulty", difficulty)))).toBe(
      "difficulty must be one of easy, medium, hard, expert",
    );
  });

  it.each(["f2f3", null, undefined, { 0: "f2f3" }])("rejects non-array moves (%s)", (moves) => {
    expect(expectError(parseGameState(withField("moves", moves)))).toBe("moves must be an array");
  });

  it.each([
    [["f2f3", 7], "Move 2 is not a valid UCI move"],
    [["f2f3", "e7e5", "G2G4"], "Move 3 is not a valid UCI move"],
    [["e2e4 "], "Move 1 is not a valid UCI move"],
    [["e2e9"], "Move 1 is not a valid UCI move"],
    [["e7e8k"], "Move 1 is not a valid UCI move"],
    [["e2-e4"], "Move 1 is not a valid UCI move"],
    [[""], "Move 1 is not a valid UCI move"],
  ])("rejects malformed moves %j", (moves, message) => {
    expect(expectError(parseGameState(withField("moves", moves)))).toBe(message);
  });

  it("rejects more moves than the cap", () => {
    const moves = Array.from({ length: MAX_MOVES + 1 }, () => "g1f3");
    expect(expectError(parseGameState(withField("moves", moves)))).toBe(`moves has more than ${MAX_MOVES} entries`);
  });

  it.each(["true", 1, null, undefined])("rejects non-boolean resigned (%s)", (resigned) => {
    expect(expectError(parseGameState(withField("resigned", resigned)))).toBe("resigned must be a boolean");
  });

  it("names the first illegal move with its 1-based half-move index", () => {
    expect(expectError(parseGameState(withField("moves", ["f2f3", "e7e5", "g2g5"])))).toBe(
      "Move 3 (g2g5) is not legal",
    );
    expect(expectError(parseGameState(withField("moves", ["e7e5"])))).toBe("Move 1 (e7e5) is not legal");
  });

  it("rejects a move played after the game ended", () => {
    expect(expectError(parseGameState(withField("moves", [...FOOLS_MATE.moves, "a2a3"])))).toBe(
      "Move 5 (a2a3) comes after the game ended",
    );
  });

  it("resigns the human's colour: white human resigning gives 0-1", () => {
    const loaded = expectLoaded(parseGameState({ ...FOOLS_MATE, moves: ["e2e4"], resigned: true }));
    expect(loaded.game.resignedColor).toBe(WHITE);
    expect(loaded.game.status()).toMatchObject({ result: "0-1", reason: "resignation" });
    expect(summarize(loaded.game)).toEqual({ result: "0-1", moveCount: 1 });
  });

  it("resigns the human's colour: black human resigning gives 1-0", () => {
    const loaded = expectLoaded(parseGameState({ ...FOOLS_MATE, playerColor: "black", moves: [], resigned: true }));
    expect(loaded.game.resignedColor).toBe(BLACK);
    expect(summarize(loaded.game)).toEqual({ result: "1-0", moveCount: 0 });
  });

  it("rejects resigned when the game had already ended", () => {
    expect(expectError(parseGameState({ ...FOOLS_MATE, resigned: true }))).toBe(
      "resigned is true but the game had already ended",
    );
  });
});

describe("parseGameStateText", () => {
  it("parses JSON text", () => {
    expect(expectLoaded(parseGameStateText(JSON.stringify(FOOLS_MATE))).state).toEqual(FOOLS_MATE);
  });

  it.each(["", "{", "not json", "{'version':1}"])("rejects invalid JSON %j", (text) => {
    expect(expectError(parseGameStateText(text))).toBe("Saved game is not valid JSON");
  });

  it("passes valid JSON of the wrong shape to the validator", () => {
    expect(expectError(parseGameStateText("[]"))).toBe("Saved game must be a JSON object");
  });
});

describe("buildGameState", () => {
  it("captures the game, settings and move list", () => {
    const game = new Game();
    for (const uci of FOOLS_MATE.moves) game.play(uci);
    expect(buildGameState(game, "white", "medium")).toEqual(FOOLS_MATE);
  });

  it("sets resigned only when the human resigned", () => {
    const humanResigned = new Game();
    humanResigned.play("e2e4");
    humanResigned.resign(BLACK);
    expect(buildGameState(humanResigned, "black", "hard").resigned).toBe(true);

    const engineResigned = new Game();
    engineResigned.resign(WHITE);
    expect(buildGameState(engineResigned, "black", "hard").resigned).toBe(false);

    expect(buildGameState(new Game(), "white", "easy").resigned).toBe(false);
  });

  it.each([
    ["an unfinished game", START_FEN, ["e2e4", "c7c5", "g1f3"], false, "black", "expert"],
    ["a finished game", START_FEN, FOOLS_MATE.moves, false, "white", "medium"],
    ["a resigned game", START_FEN, ["d2d4"], true, "white", "easy"],
    ["a custom start", "4k3/8/8/8/8/8/8/4K2R w K - 0 1", ["e1g1", "e8d7"], false, "white", "hard"],
    ["a black-to-move start", "4k3/8/8/8/8/8/8/4K2R b K - 3 20", ["e8d7"], false, "black", "medium"],
  ] as const)("round-trips %s through serialise and parse", (_label, startFen, moves, resign, playerColor, difficulty) => {
    const game = new Game(startFen);
    for (const uci of moves) game.play(uci);
    if (resign) game.resign(playerColor === "white" ? WHITE : BLACK);
    const state = buildGameState(game, playerColor, difficulty);

    const loaded = expectLoaded(parseGameState(JSON.parse(serializeGameState(state))));

    expect(loaded.state).toEqual(state);
    expect(buildGameState(loaded.game, playerColor, difficulty)).toEqual(state);
    expect(loaded.game.position.toFen()).toBe(game.position.toFen());
    expect(summarize(loaded.game)).toEqual(summarize(game));
  });
});

describe("serializeGameState", () => {
  it("writes pretty JSON with two-space indentation", () => {
    const text = serializeGameState(FOOLS_MATE);
    expect(text).toBe(JSON.stringify(FOOLS_MATE, null, 2));
    expect(text.split("\n")[1]).toBe('  "version": 1,');
  });
});

describe("summarize", () => {
  it("reports an unfinished game as * with its half-move count", () => {
    const game = new Game();
    game.play("e2e4");
    game.play("e7e5");
    expect(summarize(game)).toEqual({ result: "*", moveCount: 2 });
  });
});
