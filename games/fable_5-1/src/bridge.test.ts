import { describe, expect, it, vi } from "vitest";
import { startSaveBridge, type BridgeEvent, type BridgeWindow, type SaveSnapshot } from "./bridge";

const ORIGIN = "https://chess.example";

const setup = (overrides: { getSave?: () => SaveSnapshot | null; loadState?: (state: unknown) => void } = {}) => {
  const posted: { message: unknown; targetOrigin: string }[] = [];
  const parent = { postMessage: (message: unknown, targetOrigin: string): void => void posted.push({ message, targetOrigin }) };
  let listener: ((event: BridgeEvent) => void) | null = null;
  const win: BridgeWindow = {
    location: { origin: ORIGIN },
    parent,
    addEventListener: (_type, l) => {
      listener = l;
    },
  };
  const getSave = overrides.getSave ?? ((): SaveSnapshot | null => null);
  const loadState = overrides.loadState ?? ((): void => undefined);
  startSaveBridge(win, { getSave, loadState });
  const send = (data: unknown, origin: string = ORIGIN, source: unknown = parent): void => {
    if (listener === null) throw new Error("bridge did not register a listener");
    listener({ origin, source, data });
  };
  return { posted, send, win, parent };
};

const shell = (type: string, extra: object = {}): object => ({ source: "claude-chess-shell", type, ...extra });

describe("startSaveBridge", () => {
  it("announces ready once on load, targeted at the own origin", () => {
    const { posted } = setup();
    expect(posted).toEqual([{ message: { source: "claude-chess-game", type: "ready" }, targetOrigin: ORIGIN }]);
  });

  it("replies to ping with ready", () => {
    const { posted, send } = setup();
    send(shell("ping"));
    expect(posted).toHaveLength(2);
    expect(posted[1].message).toEqual({ source: "claude-chess-game", type: "ready" });
  });

  it("replies to request-state with the state and summary", () => {
    const save: SaveSnapshot = { state: { moves: ["e2e4"] }, summary: { result: "*", moveCount: 1 } };
    const { posted, send } = setup({ getSave: () => save });
    send(shell("request-state", { requestId: "r1" }));
    expect(posted[1]).toEqual({
      message: { source: "claude-chess-game", type: "state", requestId: "r1", state: save.state, summary: save.summary },
      targetOrigin: ORIGIN,
    });
  });

  it("replies with null state and summary when no game has started", () => {
    const { posted, send } = setup();
    send(shell("request-state", { requestId: "r2" }));
    expect(posted[1].message).toEqual({
      source: "claude-chess-game",
      type: "state",
      requestId: "r2",
      state: null,
      summary: null,
    });
  });

  it("loads state and replies ok", () => {
    const loadState = vi.fn();
    const { posted, send } = setup({ loadState });
    send(shell("load-state", { requestId: "r3", state: { moves: [] } }));
    expect(loadState).toHaveBeenCalledWith({ moves: [] });
    expect(posted[1].message).toEqual({ source: "claude-chess-game", type: "loaded", requestId: "r3", ok: true });
  });

  it("replies ok false with the error message when loading throws", () => {
    const { posted, send } = setup({
      loadState: () => {
        throw new Error("Illegal move: e2e5");
      },
    });
    send(shell("load-state", { requestId: "r4", state: {} }));
    expect(posted[1].message).toEqual({
      source: "claude-chess-game",
      type: "loaded",
      requestId: "r4",
      ok: false,
      error: "Illegal move: e2e5",
    });
  });

  it("ignores requests without a string requestId", () => {
    const loadState = vi.fn();
    const { posted, send } = setup({ loadState });
    send(shell("load-state", { state: {} }));
    expect(loadState).not.toHaveBeenCalled();
    expect(posted).toHaveLength(1);
  });

  it("ignores messages from another origin", () => {
    const { posted, send } = setup();
    send(shell("ping"), "https://evil.example");
    expect(posted).toHaveLength(1);
  });

  it("ignores messages whose source is not the parent window", () => {
    const { posted, send } = setup();
    send(shell("ping"), ORIGIN, {});
    expect(posted).toHaveLength(1);
  });

  it("ignores malformed messages and other senders", () => {
    const { posted, send } = setup();
    send(null);
    send("ping");
    send({ type: "ping" });
    send({ source: "someone-else", type: "ping" });
    send(shell("unknown-type"));
    expect(posted).toHaveLength(1);
  });

  it("does nothing when the game is not embedded", () => {
    const posted: unknown[] = [];
    const addEventListener = vi.fn();
    const win: BridgeWindow = {
      location: { origin: ORIGIN },
      parent: { postMessage: (message: unknown): void => void posted.push(message) },
      addEventListener,
    };
    // A top-level window is its own parent.
    win.parent = win as unknown as BridgeWindow["parent"];
    startSaveBridge(win, { getSave: () => null, loadState: () => undefined });
    expect(posted).toEqual([]);
    expect(addEventListener).not.toHaveBeenCalled();
  });
});
