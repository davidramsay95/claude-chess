import type { GameStateV1, GameSummary } from "./gameState";
import type { ChessSession, ImportResult } from "./session";

/** Outcome of a `load-state` request. */
export type LoadResult = ImportResult;

/** What the bridge needs from the game: read the current save and load one. */
export interface BridgeHost {
  /** The current save and its summary, or null when no game has started. */
  getState(): { state: GameStateV1; summary: GameSummary } | null;
  /** Imports an untrusted state. Must leave the game untouched on failure. */
  loadState(state: unknown): LoadResult;
}

/** The parts of a `MessageEvent` the bridge reads. */
export interface BridgeMessageEvent {
  origin: string;
  source: unknown;
  data: unknown;
}

/** Anything the bridge can post to (the shell's window). */
export interface BridgeTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

/**
 * The structural subset of `Window` the bridge uses, so tests can pass a fake while the
 * real `window` still fits without a cast. Methods use method syntax on purpose: that keeps
 * the listener parameter bivariant, which is what lets `Window`'s overloads match.
 */
export interface BridgeWindow {
  location: { origin: string };
  parent: BridgeTarget;
  addEventListener(type: "message", listener: (event: BridgeMessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: BridgeMessageEvent) => void): void;
}

const GAME_SOURCE = "claude-chess-game";
const SHELL_SOURCE = "claude-chess-shell";

type ShellMessage =
  | { type: "ping" }
  | { type: "request-state"; requestId: string }
  | { type: "load-state"; requestId: string; state: unknown };

type GameMessage =
  | { source: typeof GAME_SOURCE; type: "ready" }
  | {
      source: typeof GAME_SOURCE;
      type: "state";
      requestId: string;
      state: GameStateV1 | null;
      summary: GameSummary | null;
    }
  | { source: typeof GAME_SOURCE; type: "loaded"; requestId: string; ok: true }
  | { source: typeof GAME_SOURCE; type: "loaded"; requestId: string; ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Returns the shell message carried by `data`, or null for anything the protocol says to ignore. */
const parseShellMessage = (data: unknown): ShellMessage | null => {
  if (!isRecord(data) || data.source !== SHELL_SOURCE) return null;
  const { type, requestId } = data;
  if (type === "ping") return { type };
  if (typeof requestId !== "string") return null;
  if (type === "request-state") return { type, requestId };
  if (type === "load-state") return { type, requestId, state: data.state };
  return null;
};

const READY: GameMessage = { source: GAME_SOURCE, type: "ready" };

const reply = (host: BridgeHost, message: ShellMessage): GameMessage => {
  switch (message.type) {
    case "ping":
      return READY;
    case "request-state": {
      const current = host.getState();
      return {
        source: GAME_SOURCE,
        type: "state",
        requestId: message.requestId,
        state: current?.state ?? null,
        summary: current?.summary ?? null,
      };
    }
    case "load-state": {
      const result = host.loadState(message.state);
      return result.ok
        ? { source: GAME_SOURCE, type: "loaded", requestId: message.requestId, ok: true }
        : { source: GAME_SOURCE, type: "loaded", requestId: message.requestId, ok: false, error: result.error };
    }
  }
};

/**
 * Connects the game to the shell as described in docs/save-bridge-protocol.md: announces
 * `ready`, then answers `ping`, `request-state` and `load-state` from the parent window on the
 * same origin only. Returns a function that removes the listener.
 */
export const startBridge = (win: BridgeWindow, host: BridgeHost): (() => void) => {
  const origin = win.location.origin;
  const send = (message: GameMessage): void => {
    // Never "*": the save may be private, and the shell is always served from our origin.
    win.parent.postMessage(message, origin);
  };

  const onMessage = (event: BridgeMessageEvent): void => {
    if (event.origin !== origin || event.source !== win.parent) return;
    const message = parseShellMessage(event.data);
    if (message !== null) send(reply(host, message));
  };

  win.addEventListener("message", onMessage);
  send(READY);
  return (): void => {
    win.removeEventListener("message", onMessage);
  };
};

/** Bridge host backed by a session, so shell loads use the same import path as the UI. */
export const createSessionBridgeHost = (session: ChessSession): BridgeHost => ({
  getState: (): { state: GameStateV1; summary: GameSummary } | null => {
    const state = session.exportState();
    const summary = session.summary();
    return state === null || summary === null ? null : { state, summary };
  },
  loadState: (state: unknown): LoadResult => session.importState(state),
});
