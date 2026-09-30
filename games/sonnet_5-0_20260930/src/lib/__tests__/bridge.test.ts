import { describe, expect, it, vi } from "vitest";
import { createGame, makeMove, uciToMove, toFen } from "../../engine/index";
import { computeSummary, createNewGameRecord, exportGame, validateAndReplay, type GameRecord } from "../gameRecord";
import { handleBridgeMessage, GAME_SOURCE, SHELL_SOURCE, type BridgeCallbacks } from "../bridge";

const ORIGIN = "https://example.test";
const PARENT_WINDOW = { name: "parent-window" };
const OTHER_WINDOW = { name: "other-window" };

function makeCallbacks(initial: GameRecord | null) {
  let record = initial;
  const sendReady = vi.fn();
  const sendState = vi.fn();
  const sendLoaded = vi.fn();

  const callbacks: BridgeCallbacks = {
    getState: () => {
      if (!record) return { state: null, summary: null };
      return { state: exportGame(record), summary: computeSummary(record) };
    },
    loadState: (raw) => {
      const result = validateAndReplay(raw);
      if (!result.ok) return { ok: false, error: result.error };
      record = result.record;
      return { ok: true };
    },
    sendReady,
    sendState,
    sendLoaded,
  };

  return { callbacks, sendReady, sendState, sendLoaded, getRecord: () => record };
}

function playMoves(record: GameRecord, ucis: string[]): GameRecord {
  let state = record.state;
  const moves = [...record.moves];
  for (const uci of ucis) {
    const move = uciToMove(state, uci);
    if (!move) throw new Error(`bad test uci ${uci}`);
    const result = makeMove(state, move);
    if (!result) throw new Error(`illegal test uci ${uci}`);
    moves.push({ uci, san: result.san ?? uci });
    state = result.state;
  }
  return { ...record, moves, state };
}

describe("handleBridgeMessage", () => {
  it("replies to ping with ready", () => {
    const { callbacks, sendReady } = makeCallbacks(null);
    handleBridgeMessage(
      { origin: ORIGIN, source: PARENT_WINDOW, data: { source: SHELL_SOURCE, type: "ping" } },
      ORIGIN,
      PARENT_WINDOW,
      callbacks,
    );
    expect(sendReady).toHaveBeenCalledTimes(1);
  });

  it("replies to request-state with null/null before any game started", () => {
    const { callbacks, sendState } = makeCallbacks(null);
    handleBridgeMessage(
      { origin: ORIGIN, source: PARENT_WINDOW, data: { source: SHELL_SOURCE, type: "request-state", requestId: "r1" } },
      ORIGIN,
      PARENT_WINDOW,
      callbacks,
    );
    expect(sendState).toHaveBeenCalledWith("r1", null, null);
  });

  it("replies to request-state with the real state and summary once moves have been played", () => {
    const record = playMoves(createNewGameRecord("white", "medium"), ["e2e4", "e7e5"]);
    const { callbacks, sendState } = makeCallbacks(record);
    handleBridgeMessage(
      { origin: ORIGIN, source: PARENT_WINDOW, data: { source: SHELL_SOURCE, type: "request-state", requestId: "r2" } },
      ORIGIN,
      PARENT_WINDOW,
      callbacks,
    );
    expect(sendState).toHaveBeenCalledWith(
      "r2",
      exportGame(record),
      computeSummary(record),
    );
  });

  it("loads a valid state and reports ok:true", () => {
    const { callbacks, sendLoaded, getRecord } = makeCallbacks(null);
    const payload = {
      version: 1,
      startFen: toFen(createGame()),
      playerColor: "white",
      difficulty: "easy",
      moves: ["e2e4"],
      resigned: false,
    };
    handleBridgeMessage(
      { origin: ORIGIN, source: PARENT_WINDOW, data: { source: SHELL_SOURCE, type: "load-state", requestId: "r3", state: payload } },
      ORIGIN,
      PARENT_WINDOW,
      callbacks,
    );
    expect(sendLoaded).toHaveBeenCalledWith("r3", { ok: true });
    expect(getRecord()?.moves.map((m) => m.uci)).toEqual(["e2e4"]);
  });

  it("rejects an invalid load-state payload and leaves the current game untouched", () => {
    const existing = playMoves(createNewGameRecord("white", "medium"), ["e2e4"]);
    const { callbacks, sendLoaded, getRecord } = makeCallbacks(existing);

    handleBridgeMessage(
      {
        origin: ORIGIN,
        source: PARENT_WINDOW,
        data: { source: SHELL_SOURCE, type: "load-state", requestId: "r4", state: { version: 1 } },
      },
      ORIGIN,
      PARENT_WINDOW,
      callbacks,
    );

    expect(sendLoaded).toHaveBeenCalledWith("r4", { ok: false, error: expect.any(String) });
    expect(getRecord()).toBe(existing);
  });

  it("ignores a message with the wrong origin", () => {
    const { callbacks, sendReady } = makeCallbacks(null);
    handleBridgeMessage(
      { origin: "https://evil.test", source: PARENT_WINDOW, data: { source: SHELL_SOURCE, type: "ping" } },
      ORIGIN,
      PARENT_WINDOW,
      callbacks,
    );
    expect(sendReady).not.toHaveBeenCalled();
  });

  it("ignores a message whose source isn't the expected parent window", () => {
    const { callbacks, sendReady } = makeCallbacks(null);
    handleBridgeMessage(
      { origin: ORIGIN, source: OTHER_WINDOW, data: { source: SHELL_SOURCE, type: "ping" } },
      ORIGIN,
      PARENT_WINDOW,
      callbacks,
    );
    expect(sendReady).not.toHaveBeenCalled();
  });

  it("ignores an object missing the expected source/type fields", () => {
    const { callbacks, sendReady, sendState } = makeCallbacks(null);
    handleBridgeMessage(
      { origin: ORIGIN, source: PARENT_WINDOW, data: { hello: "world" } },
      ORIGIN,
      PARENT_WINDOW,
      callbacks,
    );
    handleBridgeMessage(
      { origin: ORIGIN, source: PARENT_WINDOW, data: { source: "someone-else", type: "ping" } },
      ORIGIN,
      PARENT_WINDOW,
      callbacks,
    );
    handleBridgeMessage(
      { origin: ORIGIN, source: PARENT_WINDOW, data: null },
      ORIGIN,
      PARENT_WINDOW,
      callbacks,
    );
    expect(sendReady).not.toHaveBeenCalled();
    expect(sendState).not.toHaveBeenCalled();
  });

  it("never uses GAME_SOURCE as an accepted incoming source (sanity check on the constants)", () => {
    expect(GAME_SOURCE).not.toBe(SHELL_SOURCE);
  });
});
