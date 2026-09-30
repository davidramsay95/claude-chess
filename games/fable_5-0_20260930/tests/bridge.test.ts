import { beforeEach, describe, expect, test } from "vitest";
import { initBridge, type BridgeWindow } from "../src/bridge";
import { applyUci, createGame, exportState, gameSummary, importState, type Game } from "../src/state";

const ORIGIN = "https://example.test";

interface Sent {
  message: Record<string, unknown>;
  targetOrigin: string;
}

class FakeParent {
  sent: Sent[] = [];

  postMessage(message: Record<string, unknown>, targetOrigin: string): void {
    this.sent.push({ message, targetOrigin });
  }

  last(): Record<string, unknown> {
    const entry = this.sent[this.sent.length - 1];
    if (!entry) throw new Error("nothing sent");
    return entry.message;
  }
}

interface Harness {
  win: BridgeWindow;
  parent: FakeParent;
  emit(data: unknown, origin?: string, source?: unknown): void;
}

const makeHarness = (): Harness => {
  const parent = new FakeParent();
  const listeners: Array<(event: MessageEvent) => void> = [];
  const win: BridgeWindow = {
    location: { origin: ORIGIN },
    parent: parent as unknown as Window,
    addEventListener: (_type: "message", listener: (event: MessageEvent) => void): void => {
      listeners.push(listener);
    }
  };
  return {
    win,
    parent,
    emit: (data, origin = ORIGIN, source = parent): void => {
      for (const listener of listeners) {
        listener({ data, origin, source } as unknown as MessageEvent);
      }
    }
  };
};

const shellMessage = (type: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  source: "claude-chess-shell",
  type,
  ...extra
});

describe("save bridge", () => {
  let game: Game | null;
  let harness: Harness;

  const startBridge = (): void => {
    initBridge(
      {
        getState: () => (game ? exportState(game) : null),
        getSummary: () => (game ? gameSummary(game) : null),
        loadState: (state) => {
          game = importState(state);
        }
      },
      harness.win
    );
  };

  beforeEach(() => {
    game = null;
    harness = makeHarness();
  });

  test("announces ready on start", () => {
    startBridge();
    expect(harness.parent.last()).toEqual({ source: "claude-chess-game", type: "ready" });
    expect(harness.parent.sent[0]?.targetOrigin).toBe(ORIGIN);
  });

  test("replies ready to ping", () => {
    startBridge();
    harness.emit(shellMessage("ping"));
    expect(harness.parent.last()).toEqual({ source: "claude-chess-game", type: "ready" });
  });

  test("request-state before any game returns nulls with the requestId", () => {
    startBridge();
    harness.emit(shellMessage("request-state", { requestId: "req-1" }));
    expect(harness.parent.last()).toEqual({
      source: "claude-chess-game",
      type: "state",
      requestId: "req-1",
      state: null,
      summary: null
    });
  });

  test("request-state during a game returns the export and summary", () => {
    game = createGame("white", "medium");
    for (const uci of ["f2f3", "e7e5", "g2g4", "d8h4"]) applyUci(game, uci);
    startBridge();
    harness.emit(shellMessage("request-state", { requestId: "req-2" }));
    const reply = harness.parent.last();
    expect(reply.type).toBe("state");
    expect(reply.requestId).toBe("req-2");
    expect(reply.state).toEqual(exportState(game));
    expect(reply.summary).toEqual({ result: "0-1", moveCount: 4 });
  });

  test("load-state with a valid state replies ok and installs the game", () => {
    startBridge();
    const state = {
      version: 1,
      startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      playerColor: "black",
      difficulty: "hard",
      moves: ["e2e4"],
      resigned: false
    };
    harness.emit(shellMessage("load-state", { requestId: "req-3", state }));
    expect(harness.parent.last()).toEqual({
      source: "claude-chess-game",
      type: "loaded",
      requestId: "req-3",
      ok: true
    });
    expect(game && exportState(game)).toEqual(state);
  });

  test("load-state with an invalid state replies ok false and leaves the game alone", () => {
    game = createGame("white", "easy");
    applyUci(game, "d2d4");
    const before = exportState(game);
    startBridge();
    const bad = { ...before, moves: ["d2d4", "d7d8"] };
    harness.emit(shellMessage("load-state", { requestId: "req-4", state: bad }));
    const reply = harness.parent.last();
    expect(reply.type).toBe("loaded");
    expect(reply.requestId).toBe("req-4");
    expect(reply.ok).toBe(false);
    expect(typeof reply.error).toBe("string");
    expect((reply.error as string).length).toBeGreaterThan(0);
    expect(exportState(game)).toEqual(before);
  });

  test("ignores messages from a different origin", () => {
    startBridge();
    const sentBefore = harness.parent.sent.length;
    harness.emit(shellMessage("ping"), "https://evil.example");
    expect(harness.parent.sent.length).toBe(sentBefore);
  });

  test("ignores messages whose source window is not the parent", () => {
    startBridge();
    const sentBefore = harness.parent.sent.length;
    harness.emit(shellMessage("ping"), ORIGIN, {});
    expect(harness.parent.sent.length).toBe(sentBefore);
  });

  test("ignores messages without the shell source marker or unknown types", () => {
    startBridge();
    const sentBefore = harness.parent.sent.length;
    harness.emit({ type: "ping" });
    harness.emit(shellMessage("self-destruct"));
    harness.emit("just a string");
    harness.emit(null);
    expect(harness.parent.sent.length).toBe(sentBefore);
  });
});
