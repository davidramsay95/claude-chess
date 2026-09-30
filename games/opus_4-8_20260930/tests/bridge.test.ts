import { beforeEach, describe, expect, it, vi } from "vitest";
import { BridgeHost, BridgeWindow, createBridge, StateSnapshot } from "../src/game/bridge.ts";
import { GameState } from "../src/game/types.ts";

const ORIGIN = "https://claude.example";

const SAMPLE_STATE: GameState = {
  version: 1,
  startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  playerColor: "white",
  difficulty: "medium",
  moves: ["e2e4", "e7e5"],
  resigned: false,
};

class FakeWindow implements BridgeWindow {
  posted: unknown[] = [];
  parent = { postMessage: (message: unknown): void => void this.posted.push(message) };
  location = { origin: ORIGIN };
  private listeners: Array<(event: MessageEvent) => void> = [];

  addEventListener(_type: "message", listener: (event: MessageEvent) => void): void {
    this.listeners.push(listener);
  }
  removeEventListener(_type: "message", listener: (event: MessageEvent) => void): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }
  dispatch(partial: { origin?: string; source?: unknown; data: unknown }): void {
    const event = {
      origin: partial.origin ?? ORIGIN,
      source: "source" in partial ? partial.source : this.parent,
      data: partial.data,
    } as unknown as MessageEvent;
    for (const listener of this.listeners) listener(event);
  }
}

function makeHost(snapshot: StateSnapshot, loadOk = true): BridgeHost & { loadState: ReturnType<typeof vi.fn> } {
  return {
    getSnapshot: () => snapshot,
    loadState: vi.fn(() => (loadOk ? { ok: true } : { ok: false, error: "Move 3 (g2g5) is not legal" })),
  };
}

describe("save bridge", () => {
  let win: FakeWindow;

  beforeEach(() => {
    win = new FakeWindow();
  });

  it("announces ready on load", () => {
    createBridge(makeHost({ state: null, summary: null }), win);
    expect(win.posted).toEqual([{ source: "claude-chess-game", type: "ready" }]);
  });

  it("replies to ping with ready", () => {
    createBridge(makeHost({ state: null, summary: null }), win);
    win.posted.length = 0;
    win.dispatch({ data: { source: "claude-chess-shell", type: "ping" } });
    expect(win.posted).toEqual([{ source: "claude-chess-game", type: "ready" }]);
  });

  it("returns nulls before a game has started", () => {
    createBridge(makeHost({ state: null, summary: null }), win);
    win.posted.length = 0;
    win.dispatch({ data: { source: "claude-chess-shell", type: "request-state", requestId: "r1" } });
    expect(win.posted[0]).toEqual({
      source: "claude-chess-game",
      type: "state",
      requestId: "r1",
      state: null,
      summary: null,
    });
  });

  it("returns the current state and summary", () => {
    const snapshot: StateSnapshot = { state: SAMPLE_STATE, summary: { result: "*", moveCount: 2 } };
    createBridge(makeHost(snapshot), win);
    win.posted.length = 0;
    win.dispatch({ data: { source: "claude-chess-shell", type: "request-state", requestId: "r2" } });
    expect(win.posted[0]).toEqual({
      source: "claude-chess-game",
      type: "state",
      requestId: "r2",
      state: SAMPLE_STATE,
      summary: { result: "*", moveCount: 2 },
    });
  });

  it("reports a successful load", () => {
    const host = makeHost({ state: null, summary: null }, true);
    createBridge(host, win);
    win.posted.length = 0;
    win.dispatch({
      data: { source: "claude-chess-shell", type: "load-state", requestId: "r3", state: SAMPLE_STATE },
    });
    expect(host.loadState).toHaveBeenCalledWith(SAMPLE_STATE);
    expect(win.posted[0]).toEqual({
      source: "claude-chess-game",
      type: "loaded",
      requestId: "r3",
      ok: true,
    });
  });

  it("reports a failed load with an error and no crash", () => {
    const host = makeHost({ state: null, summary: null }, false);
    createBridge(host, win);
    win.posted.length = 0;
    win.dispatch({
      data: { source: "claude-chess-shell", type: "load-state", requestId: "r4", state: {} },
    });
    expect(win.posted[0]).toEqual({
      source: "claude-chess-game",
      type: "loaded",
      requestId: "r4",
      ok: false,
      error: "Move 3 (g2g5) is not legal",
    });
  });

  it("ignores messages from a different origin", () => {
    createBridge(makeHost({ state: null, summary: null }), win);
    win.posted.length = 0;
    win.dispatch({ origin: "https://evil.example", data: { source: "claude-chess-shell", type: "ping" } });
    expect(win.posted).toEqual([]);
  });

  it("ignores messages from a source other than the parent", () => {
    createBridge(makeHost({ state: null, summary: null }), win);
    win.posted.length = 0;
    win.dispatch({ source: { other: true }, data: { source: "claude-chess-shell", type: "ping" } });
    expect(win.posted).toEqual([]);
  });

  it("ignores messages without the shell source field", () => {
    createBridge(makeHost({ state: null, summary: null }), win);
    win.posted.length = 0;
    win.dispatch({ data: { source: "somebody-else", type: "ping" } });
    expect(win.posted).toEqual([]);
  });
});
