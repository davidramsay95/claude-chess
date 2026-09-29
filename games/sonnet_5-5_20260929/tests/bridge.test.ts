import { describe, expect, it } from "vitest";
import { Session } from "../src/session";
import { START_FEN } from "../src/engine/position";
import { createBridge, type BridgeWindow } from "../src/bridge";

interface Sent {
  message: Record<string, unknown>;
  targetOrigin: string;
}

const ORIGIN = "https://games.example";

const setup = (): {
  session: Session;
  parent: { postMessage: (m: unknown, o: string) => void };
  sent: Sent[];
  dispatch: (data: unknown, overrides?: { origin?: string; source?: unknown }) => void;
} => {
  const sent: Sent[] = [];
  const parent = {
    postMessage: (message: unknown, targetOrigin: string): void => {
      sent.push({ message: message as Record<string, unknown>, targetOrigin });
    },
  };
  let listener: ((event: MessageEvent) => void) | null = null;
  const win = {
    location: { origin: ORIGIN },
    parent,
    addEventListener: (_type: string, fn: (event: MessageEvent) => void): void => {
      listener = fn;
    },
  } as unknown as BridgeWindow;
  const session = new Session();
  createBridge(win, session);
  const dispatch = (data: unknown, overrides: { origin?: string; source?: unknown } = {}): void => {
    listener?.({
      data,
      origin: overrides.origin ?? ORIGIN,
      source: "source" in overrides ? overrides.source : parent,
    } as unknown as MessageEvent);
  };
  return { session, parent, sent, dispatch };
};

const shell = (type: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  source: "claude-chess-shell",
  type,
  ...extra,
});

describe("bridge", () => {
  it("announces itself with ready on load", () => {
    const { sent } = setup();
    expect(sent).toEqual([{ message: { source: "claude-chess-game", type: "ready" }, targetOrigin: ORIGIN }]);
  });

  it("answers ping with ready", () => {
    const { sent, dispatch } = setup();
    sent.length = 0;
    dispatch(shell("ping"));
    expect(sent[0].message).toEqual({ source: "claude-chess-game", type: "ready" });
  });

  it("replies to request-state with nulls before a game has started", () => {
    const { sent, dispatch } = setup();
    sent.length = 0;
    dispatch(shell("request-state", { requestId: "r1" }));
    expect(sent[0].message).toEqual({
      source: "claude-chess-game",
      type: "state",
      requestId: "r1",
      state: null,
      summary: null,
    });
  });

  it("replies to request-state with the state and summary", () => {
    const { sent, dispatch, session } = setup();
    session.start("white", "medium");
    session.playMove("e2e4");
    sent.length = 0;
    dispatch(shell("request-state", { requestId: "r2" }));
    expect(sent[0].message).toEqual({
      source: "claude-chess-game",
      type: "state",
      requestId: "r2",
      state: {
        version: 1,
        startFen: START_FEN,
        playerColor: "white",
        difficulty: "medium",
        moves: ["e2e4"],
        resigned: false,
      },
      summary: { result: "*", moveCount: 1 },
    });
  });

  it("loads a valid state and replies loaded ok", () => {
    const { sent, dispatch, session } = setup();
    sent.length = 0;
    dispatch(
      shell("load-state", {
        requestId: "r3",
        state: {
          version: 1,
          startFen: START_FEN,
          playerColor: "white",
          difficulty: "medium",
          moves: ["f2f3", "e7e5", "g2g4", "d8h4"],
          resigned: false,
        },
      }),
    );
    expect(sent[0].message).toEqual({ source: "claude-chess-game", type: "loaded", requestId: "r3", ok: true });
    expect(session.summary()).toEqual({ result: "0-1", moveCount: 4 });
  });

  it("rejects an invalid state and leaves the game untouched", () => {
    const { sent, dispatch, session } = setup();
    session.start("white", "hard");
    session.playMove("e2e4");
    const before = session.snapshot();
    sent.length = 0;
    dispatch(
      shell("load-state", {
        requestId: "r4",
        state: {
          version: 1,
          startFen: START_FEN,
          playerColor: "white",
          difficulty: "medium",
          moves: ["f2f3", "e7e5", "g2g5"],
          resigned: false,
        },
      }),
    );
    expect(sent[0].message).toEqual({
      source: "claude-chess-game",
      type: "loaded",
      requestId: "r4",
      ok: false,
      error: "Move 3 (g2g5) is not legal",
    });
    expect(session.snapshot()).toEqual(before);
  });

  it("ignores messages from another origin", () => {
    const { sent, dispatch } = setup();
    sent.length = 0;
    dispatch(shell("ping"), { origin: "https://evil.example" });
    expect(sent).toHaveLength(0);
  });

  it("ignores messages from a source other than the parent", () => {
    const { sent, dispatch } = setup();
    sent.length = 0;
    dispatch(shell("ping"), { source: {} });
    expect(sent).toHaveLength(0);
  });

  it("ignores messages without the shell source or with unknown types", () => {
    const { sent, dispatch } = setup();
    sent.length = 0;
    dispatch({ type: "ping" });
    dispatch(shell("mystery"));
    dispatch("ping");
    dispatch(null);
    expect(sent).toHaveLength(0);
  });

  it("notifies the host when a load succeeds", () => {
    const { dispatch, session } = setup();
    let notified = 0;
    session.onChange = (): void => {
      notified++;
    };
    dispatch(
      shell("load-state", {
        requestId: "r5",
        state: {
          version: 1,
          startFen: START_FEN,
          playerColor: "black",
          difficulty: "easy",
          moves: [],
          resigned: false,
        },
      }),
    );
    expect(notified).toBe(1);
  });
});
