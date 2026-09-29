import { describe, expect, it, vi } from "vitest";
import { createBridge, type BridgeDeps } from "./gameBridge";
import type { SavedGame } from "./savedGame";

const ORIGIN = "https://host.test";
const parent = { postMessage: vi.fn() };
const saved: SavedGame = { humanColor: "w", difficulty: "easy", moves: ["e2e4"], resigned: false };

const setup = (overrides: Partial<BridgeDeps> = {}) => {
  const postMessage = vi.fn();
  const target = { postMessage };
  const loadState = vi.fn();
  const bridge = createBridge({ origin: ORIGIN, parent: target, getState: () => saved, loadState, ...overrides });
  const send = (data: unknown, origin = ORIGIN, source: unknown = target): void =>
    bridge.handleMessage({ data, origin, source });
  return { bridge, send, postMessage, loadState };
};

const fromShell = (type: string, extra: object = {}): object => ({ source: "claude-chess-shell", type, ...extra });

describe("game bridge", () => {
  it("announces ready on load to the same origin only", () => {
    const { bridge, postMessage } = setup();
    bridge.announceReady();
    expect(postMessage).toHaveBeenCalledWith({ source: "claude-chess-game", type: "ready" }, ORIGIN);
  });

  it("replies to ping with ready", () => {
    const { send, postMessage } = setup();
    send(fromShell("ping"));
    expect(postMessage).toHaveBeenCalledWith({ source: "claude-chess-game", type: "ready" }, ORIGIN);
  });

  it("replies to request-state with the state and summary", () => {
    const { send, postMessage } = setup();
    send(fromShell("request-state", { requestId: "r1" }));
    expect(postMessage).toHaveBeenCalledWith(
      {
        source: "claude-chess-game",
        type: "state",
        requestId: "r1",
        state: saved,
        summary: { result: "*", moveCount: 1 },
      },
      ORIGIN,
    );
  });

  it("replies with null state and summary when no game has started", () => {
    const { send, postMessage } = setup({ getState: () => null });
    send(fromShell("request-state", { requestId: "r2" }));
    expect(postMessage).toHaveBeenCalledWith(
      { source: "claude-chess-game", type: "state", requestId: "r2", state: null, summary: null },
      ORIGIN,
    );
  });

  it("loads a state and replies ok", () => {
    const { send, postMessage, loadState } = setup();
    send(fromShell("load-state", { requestId: "r3", state: saved }));
    expect(loadState).toHaveBeenCalledWith(saved);
    expect(postMessage).toHaveBeenCalledWith(
      { source: "claude-chess-game", type: "loaded", requestId: "r3", ok: true },
      ORIGIN,
    );
  });

  it("replies ok false with the error when loading fails", () => {
    const { send, postMessage } = setup({
      loadState: () => {
        throw new Error("Saved game is not valid");
      },
    });
    send(fromShell("load-state", { requestId: "r4", state: {} }));
    expect(postMessage).toHaveBeenCalledWith(
      { source: "claude-chess-game", type: "loaded", requestId: "r4", ok: false, error: "Saved game is not valid" },
      ORIGIN,
    );
  });

  it("ignores messages from another origin, another source window or another protocol source", () => {
    const { send, postMessage } = setup();
    send(fromShell("ping"), "https://evil.test");
    send(fromShell("ping"), ORIGIN, parent);
    send({ source: "someone-else", type: "ping" });
    send("ping");
    send(null);
    expect(postMessage).not.toHaveBeenCalled();
  });
});
