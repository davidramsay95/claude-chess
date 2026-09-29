import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createBridge } from "../src/bridge/bridge";
import type { BridgeHost, BridgeWindow } from "../src/bridge/contracts";
import type { LiveGame } from "../src/state/contracts";
import { exportGameState, importGameState, summaryOf } from "../src/state/gameState";

const ORIGIN = "http://localhost:8080";

interface FakeWindow extends BridgeWindow {
  listeners: Array<(event: MessageEvent) => void>;
  posted: () => unknown[];
  dispatch: (data: unknown, overrides?: { origin?: string; source?: unknown }) => void;
}

const fakeWindow = (): FakeWindow => {
  const postMessage = vi.fn();
  const parent = { postMessage };
  const win: FakeWindow = {
    location: { origin: ORIGIN },
    parent,
    listeners: [],
    addEventListener: (_type, listener) => {
      win.listeners.push(listener);
    },
    removeEventListener: (_type, listener) => {
      win.listeners = win.listeners.filter((l) => l !== listener);
    },
    posted: () => postMessage.mock.calls.map((call) => call[0] as unknown),
    dispatch: (data, overrides = {}) => {
      const event = {
        origin: overrides.origin ?? ORIGIN,
        source: "source" in overrides ? overrides.source : parent,
        data,
      } as unknown as MessageEvent;
      for (const listener of [...win.listeners]) listener(event);
    },
  };
  return win;
};

const stubHost = (overrides: Partial<BridgeHost> = {}): BridgeHost => ({
  getState: () => ({ state: null, summary: null }),
  loadState: () => ({ ok: true }),
  ...overrides,
});

const shell = (message: Record<string, unknown>): Record<string, unknown> => ({
  source: "claude-chess-shell",
  ...message,
});

const READY = { source: "claude-chess-game", type: "ready" };

describe("createBridge", () => {
  it("announces ready on start with the window origin", () => {
    const win = fakeWindow();
    createBridge(win, stubHost()).start();
    expect(win.parent.postMessage).toHaveBeenCalledTimes(1);
    expect(win.parent.postMessage).toHaveBeenCalledWith(READY, ORIGIN);
  });

  it("answers ping with ready", () => {
    const win = fakeWindow();
    createBridge(win, stubHost()).start();
    win.dispatch(shell({ type: "ping" }));
    expect(win.posted()).toEqual([READY, READY]);
  });

  it("answers request-state with the host state and summary", () => {
    const win = fakeWindow();
    const state = {
      version: 1 as const,
      startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      playerColor: "white" as const,
      difficulty: "easy" as const,
      moves: ["e2e4"],
      resigned: false,
    };
    const summary = { result: "*" as const, moveCount: 1 };
    createBridge(win, stubHost({ getState: () => ({ state, summary }) })).start();
    win.dispatch(shell({ type: "request-state", requestId: "r1" }));
    expect(win.posted()[1]).toEqual({ source: "claude-chess-game", type: "state", requestId: "r1", state, summary });
    expect(win.parent.postMessage).toHaveBeenLastCalledWith(expect.anything(), ORIGIN);
  });

  it("answers request-state with nulls before a game starts", () => {
    const win = fakeWindow();
    createBridge(win, stubHost()).start();
    win.dispatch(shell({ type: "request-state", requestId: "r2" }));
    expect(win.posted()[1]).toEqual({
      source: "claude-chess-game",
      type: "state",
      requestId: "r2",
      state: null,
      summary: null,
    });
  });

  it("answers load-state with ok true and passes the state to the host", () => {
    const win = fakeWindow();
    const loadState = vi.fn(() => ({ ok: true as const }));
    createBridge(win, stubHost({ loadState })).start();
    const state = { version: 1, moves: [] };
    win.dispatch(shell({ type: "load-state", requestId: "r3", state }));
    expect(loadState).toHaveBeenCalledWith(state);
    expect(win.posted()[1]).toEqual({ source: "claude-chess-game", type: "loaded", requestId: "r3", ok: true });
  });

  it("answers load-state with ok false and the host error", () => {
    const win = fakeWindow();
    createBridge(win, stubHost({ loadState: () => ({ ok: false, error: "Move 3 (g2g5) is not legal" }) })).start();
    win.dispatch(shell({ type: "load-state", requestId: "r4", state: {} }));
    expect(win.posted()[1]).toEqual({
      source: "claude-chess-game",
      type: "loaded",
      requestId: "r4",
      ok: false,
      error: "Move 3 (g2g5) is not legal",
    });
  });

  it("turns a throwing host into ok false", () => {
    const win = fakeWindow();
    createBridge(
      win,
      stubHost({
        loadState: () => {
          throw new Error("boom");
        },
      }),
    ).start();
    win.dispatch(shell({ type: "load-state", requestId: "r5", state: {} }));
    expect(win.posted()[1]).toEqual({
      source: "claude-chess-game",
      type: "loaded",
      requestId: "r5",
      ok: false,
      error: "boom",
    });
  });

  it("ignores messages from another origin", () => {
    const win = fakeWindow();
    createBridge(win, stubHost()).start();
    win.dispatch(shell({ type: "ping" }), { origin: "http://evil.example" });
    expect(win.posted()).toEqual([READY]);
  });

  it("ignores messages from a window other than the parent", () => {
    const win = fakeWindow();
    createBridge(win, stubHost()).start();
    win.dispatch(shell({ type: "ping" }), { source: {} });
    win.dispatch(shell({ type: "ping" }), { source: null });
    expect(win.posted()).toEqual([READY]);
  });

  it("ignores messages without the shell source field", () => {
    const win = fakeWindow();
    createBridge(win, stubHost()).start();
    win.dispatch({ source: "someone-else", type: "ping" });
    win.dispatch({ type: "ping" });
    expect(win.posted()).toEqual([READY]);
  });

  it("ignores unknown message types and non-object data", () => {
    const win = fakeWindow();
    const loadState = vi.fn(() => ({ ok: true as const }));
    createBridge(win, stubHost({ loadState })).start();
    win.dispatch(shell({ type: "explode", requestId: "x" }));
    win.dispatch("ping");
    win.dispatch(null);
    win.dispatch(42);
    expect(win.posted()).toEqual([READY]);
    expect(loadState).not.toHaveBeenCalled();
  });

  it("stops listening after stop", () => {
    const win = fakeWindow();
    const bridge = createBridge(win, stubHost());
    bridge.start();
    expect(win.listeners).toHaveLength(1);
    bridge.stop();
    expect(win.listeners).toHaveLength(0);
    win.dispatch(shell({ type: "ping" }));
    expect(win.posted()).toEqual([READY]);
  });
});

describe("the documented exchange", () => {
  interface Exchange {
    direction: "game to shell" | "shell to game";
    message: Record<string, unknown>;
  }

  const exchange = JSON.parse(
    readFileSync(new URL("../../../docs/examples/bridge-exchange.example.json", import.meta.url), "utf8"),
  ) as Exchange[];

  const gameHost = (): { host: BridgeHost; current: () => LiveGame | null } => {
    let live: LiveGame | null = null;
    const host: BridgeHost = {
      getState: () =>
        live ? { state: exportGameState(live), summary: summaryOf(live.game) } : { state: null, summary: null },
      loadState: (state) => {
        const result = importGameState(state);
        if (!result.ok) return result;
        live = result.value;
        return { ok: true };
      },
    };
    return { host, current: () => live };
  };

  it("matches every game-to-shell message in order", () => {
    const [ready, requestState, stateReply, emptyStateReply, loadState, loadedOk, loadedFail] = exchange as [
      Exchange,
      Exchange,
      Exchange,
      Exchange,
      Exchange,
      Exchange,
      Exchange,
    ];
    const win = fakeWindow();
    const { host, current } = gameHost();
    createBridge(win, host).start();
    expect(win.posted()[0]).toEqual(ready.message);

    // Setup screen: nothing to save yet.
    win.dispatch({ ...requestState.message, requestId: emptyStateReply.message.requestId });
    expect(win.posted()[1]).toEqual(emptyStateReply.message);

    // Load the fool's mate, then the shell asks for it back.
    win.dispatch(loadState.message);
    expect(win.posted()[2]).toEqual(loadedOk.message);
    expect(current()?.game.result()).toBe("0-1");
    win.dispatch(requestState.message);
    expect(win.posted()[3]).toEqual(stateReply.message);

    // A broken state is rejected and the loaded game is unchanged.
    const before = exportGameState(current() as LiveGame);
    win.dispatch({
      ...loadState.message,
      requestId: loadedFail.message.requestId,
      state: { ...(loadState.message.state as object), moves: ["f2f3", "e7e5", "g2g5"] },
    });
    expect(win.posted()[4]).toEqual(loadedFail.message);
    expect(exportGameState(current() as LiveGame)).toEqual(before);
  });
});
