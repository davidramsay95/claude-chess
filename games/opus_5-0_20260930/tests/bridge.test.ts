import { describe, it, expect, beforeEach } from "vitest";
import { createBridge, type BridgeDelegate, type BridgeWindow } from "../src/bridge.ts";
import { Game } from "../src/engine/game.ts";
import { exportState, summarise, loadState } from "../src/engine/gamestate.ts";
import { START_FEN } from "../src/engine/position.ts";

const ORIGIN = "https://chess.example";

interface Posted {
  message: Record<string, unknown>;
  targetOrigin: string;
}

function makeHarness(delegate: BridgeDelegate) {
  const posted: Posted[] = [];
  const parent = {
    postMessage(message: unknown, targetOrigin: string) {
      posted.push({ message: message as Record<string, unknown>, targetOrigin });
    },
  };
  const listeners: Array<(event: MessageEvent) => void> = [];
  const win: BridgeWindow = {
    parent,
    location: { origin: ORIGIN },
    addEventListener: (_type, listener) => listeners.push(listener),
    removeEventListener: (_type, listener) => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    },
  };
  const bridge = createBridge(delegate, win);
  const send = (data: unknown, origin = ORIGIN, source: unknown = parent) => {
    for (const listener of listeners.slice()) {
      listener({ data, origin, source } as unknown as MessageEvent);
    }
  };
  return { posted, bridge, send, listenerCount: () => listeners.length };
}

describe("save bridge", () => {
  let game: Game | null;
  let lastLoad: unknown;
  let delegate: BridgeDelegate;

  beforeEach(() => {
    game = null;
    lastLoad = undefined;
    delegate = {
      getState: () =>
        game
          ? { state: exportState(game, "white", "medium"), summary: summarise(game) }
          : { state: null, summary: null },
      loadState: (state: unknown) => {
        const result = loadState(state);
        lastLoad = state;
        game = result.game;
      },
    };
  });

  it("announces itself with ready on start", () => {
    const { posted, bridge } = makeHarness(delegate);
    bridge.start();
    expect(posted).toEqual([
      { message: { source: "claude-chess-game", type: "ready" }, targetOrigin: ORIGIN },
    ]);
  });

  it("replies to ping with ready", () => {
    const { posted, bridge, send } = makeHarness(delegate);
    bridge.start();
    posted.length = 0;
    send({ source: "claude-chess-shell", type: "ping" });
    expect(posted).toEqual([
      { message: { source: "claude-chess-game", type: "ready" }, targetOrigin: ORIGIN },
    ]);
  });

  it("sends nulls for request-state before a game has started", () => {
    const { posted, bridge, send } = makeHarness(delegate);
    bridge.start();
    posted.length = 0;
    send({ source: "claude-chess-shell", type: "request-state", requestId: "r1" });
    expect(posted[0].message).toEqual({
      source: "claude-chess-game",
      type: "state",
      requestId: "r1",
      state: null,
      summary: null,
    });
  });

  it("sends the state and summary once a game exists", () => {
    game = new Game();
    for (const uci of ["f2f3", "e7e5", "g2g4", "d8h4"]) game!.playUci(uci);
    const { posted, bridge, send } = makeHarness(delegate);
    bridge.start();
    posted.length = 0;
    send({ source: "claude-chess-shell", type: "request-state", requestId: "req-1" });
    expect(posted[0].message).toEqual({
      source: "claude-chess-game",
      type: "state",
      requestId: "req-1",
      state: {
        version: 1,
        startFen: START_FEN,
        playerColor: "white",
        difficulty: "medium",
        moves: ["f2f3", "e7e5", "g2g4", "d8h4"],
        resigned: false,
      },
      summary: { result: "0-1", moveCount: 4 },
    });
  });

  it("loads a valid state and reports ok", () => {
    const { posted, bridge, send } = makeHarness(delegate);
    bridge.start();
    posted.length = 0;
    const state = {
      version: 1,
      startFen: START_FEN,
      playerColor: "white",
      difficulty: "medium",
      moves: ["f2f3", "e7e5", "g2g4", "d8h4"],
      resigned: false,
    };
    send({ source: "claude-chess-shell", type: "load-state", requestId: "req-3", state });
    expect(posted[0].message).toEqual({
      source: "claude-chess-game",
      type: "loaded",
      requestId: "req-3",
      ok: true,
    });
    expect(lastLoad).toEqual(state);
    expect(game!.uciMoves()).toEqual(state.moves);
  });

  it("reports ok false with a short error and leaves the game untouched", () => {
    game = new Game();
    game.playUci("d2d4");
    const fenBefore = game.position.toFen();
    const { posted, bridge, send } = makeHarness(delegate);
    bridge.start();
    posted.length = 0;
    send({
      source: "claude-chess-shell",
      type: "load-state",
      requestId: "req-4",
      state: {
        version: 1,
        startFen: START_FEN,
        playerColor: "white",
        difficulty: "medium",
        moves: ["f2f3", "e7e5", "g2g5"],
        resigned: false,
      },
    });
    const reply = posted[0].message as { ok: boolean; error: string; requestId: string };
    expect(reply.ok).toBe(false);
    expect(reply.requestId).toBe("req-4");
    expect(reply.error).toMatch(/Move 3 \(g2g5\)/);
    expect(reply.error.length).toBeLessThan(120);
    expect(game!.position.toFen()).toBe(fenBefore);
    expect(game!.uciMoves()).toEqual(["d2d4"]);
  });

  it("ignores messages from another origin", () => {
    const { posted, bridge, send } = makeHarness(delegate);
    bridge.start();
    posted.length = 0;
    send({ source: "claude-chess-shell", type: "ping" }, "https://evil.example");
    send({ source: "claude-chess-shell", type: "request-state", requestId: "x" }, "https://evil.example");
    expect(posted).toEqual([]);
  });

  it("ignores messages from a window that is not the parent", () => {
    const { posted, bridge, send } = makeHarness(delegate);
    bridge.start();
    posted.length = 0;
    send({ source: "claude-chess-shell", type: "ping" }, ORIGIN, { postMessage() {} });
    expect(posted).toEqual([]);
  });

  it("ignores messages that are not shell messages", () => {
    const { posted, bridge, send } = makeHarness(delegate);
    bridge.start();
    posted.length = 0;
    send({ source: "claude-chess-game", type: "ready" });
    send({ type: "ping" });
    send({ source: "claude-chess-shell" });
    send({ source: "claude-chess-shell", type: "not-a-real-type", requestId: "q" });
    send("ping");
    send(null);
    expect(posted).toEqual([]);
  });

  it("stops listening when torn down", () => {
    const harness = makeHarness(delegate);
    harness.bridge.start();
    expect(harness.listenerCount()).toBe(1);
    harness.bridge.stop();
    expect(harness.listenerCount()).toBe(0);
    harness.posted.length = 0;
    harness.send({ source: "claude-chess-shell", type: "ping" });
    expect(harness.posted).toEqual([]);
  });
});
