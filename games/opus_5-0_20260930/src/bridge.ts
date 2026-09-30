/**
 * The `postMessage` contract with the hosting shell, kept free of any direct
 * `window` reference so it can be driven by a fake parent window in tests.
 */

import type { GameSummary } from "./engine/gamestate.ts";

const GAME_SOURCE = "claude-chess-game";
const SHELL_SOURCE = "claude-chess-shell";
/** Long enough to identify the problem, short enough for the shell's toast. */
const MAX_ERROR_LENGTH = 100;

export interface BridgePostTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

export interface BridgeWindow {
  parent: BridgePostTarget;
  location: { origin: string };
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  removeEventListener(type: string, listener: (event: MessageEvent) => void): void;
}

export interface BridgeDelegate {
  /** `state` and `summary` are both null until a game has started. */
  getState(): { state: unknown; summary: GameSummary | null };
  /** Throws an `Error` with a short message when the state is unusable. */
  loadState(state: unknown): void;
}

export interface Bridge {
  start(): void;
  stop(): void;
}

export function createBridge(delegate: BridgeDelegate, win: BridgeWindow): Bridge {
  const post = (message: Record<string, unknown>): void => {
    win.parent.postMessage({ source: GAME_SOURCE, ...message }, win.location.origin);
  };

  const handleMessage = (event: MessageEvent): void => {
    if (event.origin !== win.location.origin) return;
    if (event.source !== win.parent) return;

    const data: unknown = event.data;
    if (typeof data !== "object" || data === null) return;
    const message = data as { source?: unknown; type?: unknown; requestId?: unknown; state?: unknown };
    if (message.source !== SHELL_SOURCE || typeof message.type !== "string") return;

    switch (message.type) {
      case "ping":
        post({ type: "ready" });
        return;
      case "request-state": {
        const { state, summary } = delegate.getState();
        post({ type: "state", requestId: message.requestId, state, summary });
        return;
      }
      case "load-state": {
        try {
          delegate.loadState(message.state);
          post({ type: "loaded", requestId: message.requestId, ok: true });
        } catch (error) {
          post({
            type: "loaded",
            requestId: message.requestId,
            ok: false,
            error: shortMessage(error),
          });
        }
        return;
      }
      default:
        return;
    }
  };

  return {
    start(): void {
      win.addEventListener("message", handleMessage);
      post({ type: "ready" });
    },
    stop(): void {
      win.removeEventListener("message", handleMessage);
    },
  };
}

function shortMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.length > MAX_ERROR_LENGTH ? `${text.slice(0, MAX_ERROR_LENGTH - 1)}…` : text;
}
