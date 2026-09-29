import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadState, requestState, waitForFrameLoad, waitForReady } from "./gameBridge.ts";

interface FakeGame {
  frame: HTMLIFrameElement;
  posted: Array<{ message: Record<string, unknown>; targetOrigin: string }>;
  /** Delivers a message to the shell as if the given window sent it. */
  deliver: (data: unknown, overrides?: { origin?: string; source?: Window | null }) => void;
}

const createFakeGame = (): FakeGame => {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const contentWindow = frame.contentWindow as Window; // Attached to the document one line above.
  const posted: FakeGame["posted"] = [];
  contentWindow.postMessage = ((message: Record<string, unknown>, targetOrigin: string): void => {
    posted.push({ message, targetOrigin });
  }) as Window["postMessage"]; // Test double that records instead of delivering.
  const deliver: FakeGame["deliver"] = (data, overrides = {}) => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data,
        origin: overrides.origin ?? window.location.origin,
        source: overrides.source === undefined ? contentWindow : overrides.source,
      }),
    );
  };
  return { frame, posted, deliver };
};

const fromGame = (message: Record<string, unknown>): Record<string, unknown> => ({
  source: "claude-chess-game",
  ...message,
});

let game: FakeGame;

beforeEach(() => {
  document.body.replaceChildren();
  game = createFakeGame();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("requestState", () => {
  it("sends request-state to the same origin and resolves with the game reply", async () => {
    const pending = requestState(game.frame);
    expect(game.posted).toHaveLength(1);
    const { message, targetOrigin } = game.posted[0];
    expect(targetOrigin).toBe(window.location.origin);
    expect(message).toMatchObject({ source: "claude-chess-shell", type: "request-state" });
    expect(typeof message.requestId).toBe("string");

    game.deliver(
      fromGame({ type: "state", requestId: message.requestId, state: { fen: "x" }, summary: { result: "*", moveCount: 3 } }),
    );
    await expect(pending).resolves.toEqual({ state: { fen: "x" }, summary: { result: "*", moveCount: 3 } });
  });

  it("resolves null when the game has nothing to save", async () => {
    const pending = requestState(game.frame);
    game.deliver(fromGame({ type: "state", requestId: game.posted[0].message.requestId, state: null, summary: null }));
    await expect(pending).resolves.toBeNull();
  });

  it("rejects with a clear error when the game does not answer in time", async () => {
    vi.useFakeTimers();
    const pending = requestState(game.frame, { timeoutMs: 3000 });
    const assertion = expect(pending).rejects.toThrow(/did not respond/i);
    await vi.advanceTimersByTimeAsync(3001);
    await assertion;
  });

  it("ignores replies with a different origin, source window, sender tag or requestId", async () => {
    vi.useFakeTimers();
    const pending = requestState(game.frame, { timeoutMs: 1000 });
    const assertion = expect(pending).rejects.toThrow(/did not respond/i);
    const requestId = game.posted[0].message.requestId;
    const reply = { type: "state", requestId, state: { a: 1 }, summary: { result: "*", moveCount: 1 } };

    game.deliver(fromGame(reply), { origin: "https://evil.example" });
    game.deliver(fromGame(reply), { source: window });
    game.deliver(fromGame(reply), { source: null });
    game.deliver({ ...reply, source: "someone-else" });
    game.deliver(fromGame({ ...reply, requestId: "other" }));
    game.deliver("not an object");
    game.deliver(null);

    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
  });

  it("rejects when the frame has no content window", async () => {
    const detached = document.createElement("iframe");
    await expect(requestState(detached)).rejects.toThrow(/not available/i);
  });
});

describe("loadState", () => {
  it("sends load-state with the state and resolves on loaded ok", async () => {
    const pending = loadState(game.frame, { fen: "y" });
    const { message } = game.posted[0];
    expect(message).toMatchObject({ source: "claude-chess-shell", type: "load-state", state: { fen: "y" } });
    game.deliver(fromGame({ type: "loaded", requestId: message.requestId, ok: true }));
    await expect(pending).resolves.toBeUndefined();
  });

  it("rejects with the game's error text when the load is refused", async () => {
    const pending = loadState(game.frame, { bad: true });
    game.deliver(fromGame({ type: "loaded", requestId: game.posted[0].message.requestId, ok: false, error: "Illegal move at ply 4" }));
    await expect(pending).rejects.toThrow("Illegal move at ply 4");
  });

  it("uses a generic message when a refused load carries no error text", async () => {
    const pending = loadState(game.frame, {});
    game.deliver(fromGame({ type: "loaded", requestId: game.posted[0].message.requestId, ok: false }));
    await expect(pending).rejects.toThrow(/could not load/i);
  });

  it("times out when the game never replies", async () => {
    vi.useFakeTimers();
    const pending = loadState(game.frame, {}, { timeoutMs: 500 });
    const assertion = expect(pending).rejects.toThrow(/did not respond/i);
    await vi.advanceTimersByTimeAsync(501);
    await assertion;
  });
});

describe("waitForReady", () => {
  it("pings straight away and resolves when the game answers ready", async () => {
    const pending = waitForReady(game.frame);
    expect(game.posted[0].message).toMatchObject({ source: "claude-chess-shell", type: "ping" });
    expect(game.posted[0].targetOrigin).toBe(window.location.origin);
    game.deliver(fromGame({ type: "ready" }));
    await expect(pending).resolves.toBeUndefined();
  });

  it("pings again after each iframe load so an earlier ready is not missed", async () => {
    const pending = waitForReady(game.frame);
    game.frame.dispatchEvent(new Event("load"));
    expect(game.posted.filter(({ message }) => message.type === "ping")).toHaveLength(2);
    game.deliver(fromGame({ type: "ready" }));
    await pending;
    game.frame.dispatchEvent(new Event("load"));
    expect(game.posted).toHaveLength(2);
  });

  it("ignores ready from a foreign origin or window and then times out", async () => {
    vi.useFakeTimers();
    const pending = waitForReady(game.frame, { timeoutMs: 800 });
    const assertion = expect(pending).rejects.toThrow(/did not respond/i);
    game.deliver(fromGame({ type: "ready" }), { origin: "https://evil.example" });
    game.deliver(fromGame({ type: "ready" }), { source: window });
    await vi.advanceTimersByTimeAsync(801);
    await assertion;
  });
});

describe("waitForFrameLoad", () => {
  it("resolves on the next load event", async () => {
    const pending = waitForFrameLoad(game.frame);
    game.frame.dispatchEvent(new Event("load"));
    await expect(pending).resolves.toBeUndefined();
  });

  it("rejects when the frame never finishes loading", async () => {
    vi.useFakeTimers();
    const pending = waitForFrameLoad(game.frame, { timeoutMs: 100 });
    const assertion = expect(pending).rejects.toThrow(/finish loading/i);
    await vi.advanceTimersByTimeAsync(101);
    await assertion;
  });
});
