import { GameResult } from "../engine/types.ts";
import { GameState } from "./types.ts";

const GAME_SOURCE = "claude-chess-game";
const SHELL_SOURCE = "claude-chess-shell";

export interface StateSnapshot {
  state: GameState | null;
  summary: { result: GameResult; moveCount: number } | null;
}

/** What the bridge needs from the running app. */
export interface BridgeHost {
  /** Current saved state and summary, or nulls before a game has started. */
  getSnapshot(): StateSnapshot;
  /** Validate + replay a state, swapping the live game only on success. */
  loadState(input: unknown): { ok: boolean; error?: string };
}

/** The subset of `window` the bridge uses, so tests can inject a fake. */
export interface BridgeWindow {
  location: { origin: string };
  parent: { postMessage(message: unknown, targetOrigin: string): void };
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

/**
 * Wire up the save-bridge message protocol. Announces `ready`, then answers
 * `ping`, `request-state` and `load-state`, ignoring anything not from the
 * parent window on the same origin.
 */
export function createBridge(host: BridgeHost, win: BridgeWindow = window): { dispose(): void } {
  const post = (message: unknown): void => {
    win.parent.postMessage(message, win.location.origin);
  };

  const listener = (event: MessageEvent): void => {
    // Same-origin, from the parent window only.
    if (event.origin !== win.location.origin) return;
    if (event.source !== (win.parent as unknown as MessageEventSource)) return;

    const data = event.data as { source?: unknown; type?: unknown; requestId?: unknown; state?: unknown };
    if (!data || typeof data !== "object" || data.source !== SHELL_SOURCE) return;

    switch (data.type) {
      case "ping":
        post({ source: GAME_SOURCE, type: "ready" });
        break;
      case "request-state": {
        const snapshot = host.getSnapshot();
        post({
          source: GAME_SOURCE,
          type: "state",
          requestId: data.requestId,
          state: snapshot.state,
          summary: snapshot.summary,
        });
        break;
      }
      case "load-state": {
        const result = host.loadState(data.state);
        post({
          source: GAME_SOURCE,
          type: "loaded",
          requestId: data.requestId,
          ok: result.ok,
          ...(result.ok ? {} : { error: result.error ?? "Invalid game state" }),
        });
        break;
      }
    }
  };

  win.addEventListener("message", listener);
  post({ source: GAME_SOURCE, type: "ready" });

  return {
    dispose(): void {
      win.removeEventListener("message", listener);
    },
  };
}
