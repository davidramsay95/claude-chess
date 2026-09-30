import { describe, expect, it } from "vitest";
import { createGame, makeMove, toFen, uciToMove } from "../../engine/index";
import {
  computeSummary,
  createNewGameRecord,
  exportGame,
  validateAndReplay,
  type GameRecord,
} from "../gameRecord";

/** Builds a `GameRecord` by actually playing `ucis` through the real engine. */
function playMoves(record: GameRecord, ucis: string[]): GameRecord {
  let state = record.state;
  const moves = [...record.moves];
  for (const uci of ucis) {
    const move = uciToMove(state, uci);
    if (!move) throw new Error(`test setup: bad uci ${uci}`);
    const result = makeMove(state, move);
    if (!result) throw new Error(`test setup: illegal uci ${uci}`);
    moves.push({ uci, san: result.san ?? uci });
    state = result.state;
  }
  return { ...record, moves, state };
}

describe("createNewGameRecord", () => {
  it("starts from the standard position with no moves played", () => {
    const record = createNewGameRecord("white", "medium");
    expect(record.moves).toEqual([]);
    expect(record.resigned).toBe(false);
    expect(record.startFen).toBe(toFen(createGame()));
  });
});

describe("export -> import round trip", () => {
  it("gives back an identical logical game", () => {
    const original = playMoves(createNewGameRecord("black", "hard"), [
      "f2f3",
      "e7e5",
      "g2g4",
      "d8h4",
    ]);

    const exported = exportGame(original);
    expect(exported).toEqual({
      version: 1,
      startFen: original.startFen,
      playerColor: "black",
      difficulty: "hard",
      moves: ["f2f3", "e7e5", "g2g4", "d8h4"],
      resigned: false,
    });

    const result = validateAndReplay(exported);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.record.playerColor).toBe(original.playerColor);
    expect(result.record.difficulty).toBe(original.difficulty);
    expect(result.record.resigned).toBe(original.resigned);
    expect(result.record.moves.map((m) => m.uci)).toEqual(original.moves.map((m) => m.uci));
    expect(result.record.moves.map((m) => m.san)).toEqual(original.moves.map((m) => m.san));
    expect(toFen(result.record.state)).toBe(toFen(original.state));
  });

  it("round-trips a resigned game", () => {
    const original: GameRecord = { ...playMoves(createNewGameRecord("white", "easy"), ["e2e4"]), resigned: true };
    const exported = exportGame(original);
    expect(exported.resigned).toBe(true);

    const result = validateAndReplay(exported);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.resigned).toBe(true);
  });

  it("round-trips a game with no moves played yet", () => {
    const original = createNewGameRecord("white", "expert");
    const exported = exportGame(original);
    expect(exported.moves).toEqual([]);

    const result = validateAndReplay(exported);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.moves).toEqual([]);
    expect(toFen(result.record.state)).toBe(toFen(original.state));
  });
});

describe("validateAndReplay rejects invalid input", () => {
  it("rejects non-object JSON", () => {
    const result = validateAndReplay("not an object");
    expect(result.ok).toBe(false);
  });

  it("rejects the wrong version", () => {
    const result = validateAndReplay({
      version: 2,
      startFen: toFen(createGame()),
      playerColor: "white",
      difficulty: "easy",
      moves: [],
      resigned: false,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/version/i);
  });

  it("rejects a missing field", () => {
    const result = validateAndReplay({
      version: 1,
      startFen: toFen(createGame()),
      playerColor: "white",
      // difficulty missing
      moves: [],
      resigned: false,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an illegal move in the moves array", () => {
    const result = validateAndReplay({
      version: 1,
      startFen: toFen(createGame()),
      playerColor: "white",
      difficulty: "medium",
      moves: ["e2e4", "e2e4"], // black can't move a white pawn twice
      resigned: false,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/e2e4/);
  });

  it("rejects a malformed uci string", () => {
    const result = validateAndReplay({
      version: 1,
      startFen: toFen(createGame()),
      playerColor: "white",
      difficulty: "medium",
      moves: ["not-a-move"],
      resigned: false,
    });
    expect(result.ok).toBe(false);
  });

  it("does not change an in-progress game when an import is rejected", () => {
    const inProgress = playMoves(createNewGameRecord("white", "medium"), ["e2e4", "e7e5"]);
    const before = { ...inProgress, moves: [...inProgress.moves] };

    const result = validateAndReplay({ version: 1, startFen: "garbage", playerColor: "white" });
    expect(result.ok).toBe(false);

    // validateAndReplay never touches its input; simulate the caller's
    // pattern of only swapping in the new record on success.
    const stillInProgress = result.ok ? result.record : inProgress;
    expect(stillInProgress).toBe(inProgress);
    expect(stillInProgress.moves).toEqual(before.moves);
    expect(toFen(stillInProgress.state)).toBe(toFen(before.state));
  });
});

describe("computeSummary", () => {
  it("reports '*' for an unfinished game", () => {
    const record = playMoves(createNewGameRecord("white", "easy"), ["e2e4"]);
    expect(computeSummary(record)).toEqual({ result: "*", moveCount: 1 });
  });

  it("reports the winner when the human resigns", () => {
    const record = { ...createNewGameRecord("white", "easy"), resigned: true };
    expect(computeSummary(record).result).toBe("0-1");
  });

  it("reports checkmate correctly (fool's mate)", () => {
    const record = playMoves(createNewGameRecord("white", "easy"), [
      "f2f3",
      "e7e5",
      "g2g4",
      "d8h4",
    ]);
    const summary = computeSummary(record);
    expect(summary.result).toBe("0-1");
    expect(summary.moveCount).toBe(4);
  });
});
