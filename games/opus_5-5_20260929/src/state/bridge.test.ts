import { describe, expect, it } from "vitest";
// Copy of docs/examples/bridge-exchange.example.json so this folder can be tested on its own.
import exchangeText from "./bridge-exchange.fixture.json?raw";
import {
  createSessionBridgeHost,
  startBridge,
  type BridgeHost,
  type BridgeMessageEvent,
  type BridgeWindow,
  type LoadResult,
} from "./bridge";
import { ChessSession } from "./session";

const ORIGIN = "http://localhost:5173";

interface Posted {
  message: unknown;
  targetOrigin: string;
}

interface FakeParent {
  postMessage(message: unknown, targetOrigin: string): void;
  posted: Posted[];
}

interface FakeWindow extends BridgeWindow {
  parent: FakeParent;
  listenerCount(): number;
  dispatch(event: BridgeMessageEvent): void;
}

const createFakeParent = (): FakeParent => {
  const posted: Posted[] = [];
  return {
    posted,
    postMessage(message: unknown, targetOrigin: string): void {
      // Round-trip through JSON so the test fails if a reply is not a plain serialisable object.
      posted.push({ message: JSON.parse(JSON.stringify(message)), targetOrigin });
    },
  };
};

const createFakeWindow = (): FakeWindow => {
  const listeners = new Set<(event: BridgeMessageEvent) => void>();
  return {
    location: { origin: ORIGIN },
    parent: createFakeParent(),
    addEventListener(type: "message", listener: (event: BridgeMessageEvent) => void): void {
      if (type === "message") listeners.add(listener);
    },
    removeEventListener(type: "message", listener: (event: BridgeMessageEvent) => void): void {
      if (type === "message") listeners.delete(listener);
    },
    listenerCount: (): number => listeners.size,
    dispatch(event: BridgeMessageEvent): void {
      for (const listener of [...listeners]) listener(event);
    },
  };
};

const fromShell = (win: FakeWindow, data: unknown): void => {
  win.dispatch({ origin: ORIGIN, source: win.parent, data });
};

const sentMessages = (win: FakeWindow): unknown[] => win.parent.posted.map((entry) => entry.message);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const exchange: unknown = JSON.parse(exchangeText);

const step = (index: number): Record<string, unknown> => {
  const found: unknown = Array.isArray(exchange) ? exchange[index] : undefined;
  if (!isRecord(found) || !isRecord(found.message)) throw new Error(`Example exchange has no step ${index}`);
  return found.message;
};

const READY = { source: "claude-chess-game", type: "ready" };

describe("startBridge with a session", () => {
  it("replays the documented example exchange exactly", () => {
    const win = createFakeWindow();
    const session = new ChessSession();
    startBridge(win, createSessionBridgeHost(session));

    // 0: ready on start
    expect(sentMessages(win)).toEqual([step(0)]);

    // 3: request-state before any game gives nulls
    fromShell(win, { source: "claude-chess-shell", type: "request-state", requestId: step(3).requestId });
    expect(sentMessages(win).at(-1)).toEqual(step(3));

    // 4 -> 5: load the fool's mate
    fromShell(win, step(4));
    expect(sentMessages(win).at(-1)).toEqual(step(5));

    // 1 -> 2: request-state returns the export and summary
    fromShell(win, step(1));
    expect(sentMessages(win).at(-1)).toEqual(step(2));

    const savedState = step(4).state;
    if (!isRecord(savedState)) throw new Error("Example load-state has no state object");

    // 6: a failed load reports the error and leaves the game untouched
    const gameBefore = session.game;
    const loadFailed = step(6);
    fromShell(win, {
      source: "claude-chess-shell",
      type: "load-state",
      requestId: loadFailed.requestId,
      state: { ...savedState, moves: ["f2f3", "e7e5", "g2g5"] },
    });
    expect(sentMessages(win).at(-1)).toEqual(loadFailed);
    expect(session.game).toBe(gameBefore);
    expect(session.summary()).toEqual({ result: "0-1", moveCount: 4 });

    expect(win.parent.posted.every((entry) => entry.targetOrigin === ORIGIN)).toBe(true);
  });

  it("returns state and summary after a game is played in the session", () => {
    const win = createFakeWindow();
    const session = new ChessSession();
    startBridge(win, createSessionBridgeHost(session));
    session.newGame("black", "easy");
    session.playMove("e2e4");

    fromShell(win, { source: "claude-chess-shell", type: "request-state", requestId: "r1" });

    expect(sentMessages(win).at(-1)).toEqual({
      source: "claude-chess-game",
      type: "state",
      requestId: "r1",
      state: session.exportState(),
      summary: { result: "*", moveCount: 1 },
    });
  });
});

describe("startBridge protocol", () => {
  interface RecordingHost extends BridgeHost {
    loads: unknown[];
    nextResult: LoadResult;
  }

  const createHost = (): RecordingHost => {
    const host: RecordingHost = {
      loads: [],
      nextResult: { ok: true },
      getState: (): null => null,
      loadState: (state: unknown): LoadResult => {
        host.loads.push(state);
        return host.nextResult;
      },
    };
    return host;
  };

  it("announces ready to the parent with the window's own origin, never *", () => {
    const win = createFakeWindow();
    startBridge(win, createHost());
    expect(win.parent.posted).toEqual([{ message: READY, targetOrigin: ORIGIN }]);
  });

  it("answers ping with ready", () => {
    const win = createFakeWindow();
    startBridge(win, createHost());
    fromShell(win, { source: "claude-chess-shell", type: "ping" });
    expect(win.parent.posted).toEqual([
      { message: READY, targetOrigin: ORIGIN },
      { message: READY, targetOrigin: ORIGIN },
    ]);
  });

  it("passes load-state payloads to the host and reports its error", () => {
    const win = createFakeWindow();
    const host = createHost();
    host.nextResult = { ok: false, error: "Saved game must be a JSON object" };
    startBridge(win, host);

    fromShell(win, { source: "claude-chess-shell", type: "load-state", requestId: "r9", state: "nope" });

    expect(host.loads).toEqual(["nope"]);
    expect(sentMessages(win).at(-1)).toEqual({
      source: "claude-chess-game",
      type: "loaded",
      requestId: "r9",
      ok: false,
      error: "Saved game must be a JSON object",
    });
  });

  it("ignores messages from another origin", () => {
    const win = createFakeWindow();
    const host = createHost();
    startBridge(win, host);
    win.dispatch({ origin: "https://evil.example", source: win.parent, data: { source: "claude-chess-shell", type: "ping" } });
    win.dispatch({
      origin: "https://evil.example",
      source: win.parent,
      data: { source: "claude-chess-shell", type: "load-state", requestId: "x", state: {} },
    });
    expect(win.parent.posted).toHaveLength(1);
    expect(host.loads).toEqual([]);
  });

  it("ignores messages from a window other than the parent", () => {
    const win = createFakeWindow();
    const host = createHost();
    startBridge(win, host);
    const otherWindow = createFakeParent();
    win.dispatch({ origin: ORIGIN, source: otherWindow, data: { source: "claude-chess-shell", type: "ping" } });
    win.dispatch({ origin: ORIGIN, source: null, data: { source: "claude-chess-shell", type: "ping" } });
    win.dispatch({
      origin: ORIGIN,
      source: otherWindow,
      data: { source: "claude-chess-shell", type: "load-state", requestId: "x", state: {} },
    });
    expect(win.parent.posted).toHaveLength(1);
    expect(otherWindow.posted).toHaveLength(0);
    expect(host.loads).toEqual([]);
  });

  it.each([
    ["null data", null],
    ["a string", "ping"],
    ["an array", [{ source: "claude-chess-shell", type: "ping" }]],
    ["the game's own source", { source: "claude-chess-game", type: "ping" }],
    ["a missing source", { type: "ping" }],
    ["an unknown type", { source: "claude-chess-shell", type: "reset" }],
    ["a missing type", { source: "claude-chess-shell" }],
    ["request-state without requestId", { source: "claude-chess-shell", type: "request-state" }],
    ["request-state with a numeric requestId", { source: "claude-chess-shell", type: "request-state", requestId: 7 }],
    ["load-state without requestId", { source: "claude-chess-shell", type: "load-state", state: {} }],
  ])("ignores %s", (_label, data) => {
    const win = createFakeWindow();
    const host = createHost();
    startBridge(win, host);
    fromShell(win, data);
    expect(win.parent.posted).toHaveLength(1);
    expect(host.loads).toEqual([]);
  });

  it("stop() removes the listener", () => {
    const win = createFakeWindow();
    const stop = startBridge(win, createHost());
    expect(win.listenerCount()).toBe(1);
    stop();
    expect(win.listenerCount()).toBe(0);
    fromShell(win, { source: "claude-chess-shell", type: "ping" });
    expect(win.parent.posted).toHaveLength(1);
  });

  it("accepts the real browser Window type without casts", () => {
    // Compile-time check only: node has no `window`, so this never touches a real one.
    const accept = (real: Window): BridgeWindow => real;
    expect(typeof accept).toBe("function");
  });
});
