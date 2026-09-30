/**
 * Save bridge: postMessage protocol between the hosting shell and this game.
 * See docs/save-bridge-protocol.md in the repository root.
 */
import type { GameSummary, SavedGame } from "./state";

export interface BridgeHost {
  getState(): SavedGame | null;
  getSummary(): GameSummary | null;
  /** Must throw an Error with a readable message when the state is invalid. */
  loadState(state: unknown): void;
}

/** The subset of Window the bridge touches, so tests can fake it. */
export interface BridgeWindow {
  location: { origin: string };
  parent: Window;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

const GAME_SOURCE = "claude-chess-game";
const SHELL_SOURCE = "claude-chess-shell";

export const initBridge = (host: BridgeHost, win: BridgeWindow = window): void => {
  const send = (message: Record<string, unknown>): void => {
    win.parent.postMessage({ source: GAME_SOURCE, ...message }, win.location.origin);
  };

  win.addEventListener("message", (event) => {
    if (event.origin !== win.location.origin || event.source !== win.parent) return;
    const data = event.data as Record<string, unknown> | null;
    if (typeof data !== "object" || data === null || data.source !== SHELL_SOURCE) return;

    switch (data.type) {
      case "ping":
        send({ type: "ready" });
        break;
      case "request-state":
        send({
          type: "state",
          requestId: data.requestId,
          state: host.getState(),
          summary: host.getSummary()
        });
        break;
      case "load-state":
        try {
          host.loadState(data.state);
          send({ type: "loaded", requestId: data.requestId, ok: true });
        } catch (error) {
          send({
            type: "loaded",
            requestId: data.requestId,
            ok: false,
            error: error instanceof Error ? error.message : "Invalid saved game"
          });
        }
        break;
      default:
        break;
    }
  });

  send({ type: "ready" });
};
