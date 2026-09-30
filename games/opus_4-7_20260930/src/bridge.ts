import type { SavedState } from "./state.js";

// Messages the game sends to the shell.
export interface ReadyMsg { source: "claude-chess-game"; type: "ready"; }
export interface StateMsg { source: "claude-chess-game"; type: "state"; requestId: string; state: SavedState | null; summary: { result: string; moveCount: number } | null; }
export interface LoadedMsg { source: "claude-chess-game"; type: "loaded"; requestId: string; ok: boolean; error?: string; }

// Messages the shell sends to the game.
export interface PingMsg { source: "claude-chess-shell"; type: "ping"; }
export interface RequestStateMsg { source: "claude-chess-shell"; type: "request-state"; requestId: string; }
export interface LoadStateMsg { source: "claude-chess-shell"; type: "load-state"; requestId: string; state: unknown; }
export type ShellMsg = PingMsg | RequestStateMsg | LoadStateMsg;

export interface BridgeHandlers {
  onRequestState: () => { state: SavedState | null; summary: { result: string; moveCount: number } | null };
  onLoadState: (state: unknown) => { ok: true } | { ok: false; error: string };
}

export interface BridgeHost {
  addEventListener(type: "message", listener: (e: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (e: MessageEvent) => void): void;
  location: { origin: string };
  parent: unknown;
  postMessage(msg: unknown, targetOrigin: string): void;
}

/**
 * Wire up the postMessage bridge to a parent frame.
 * Validates event.origin === window.location.origin and event.source === window.parent
 * before acting on any message. Sends `ready` once installed.
 * Returns a teardown function.
 */
export function installBridge(host: BridgeHost, handlers: BridgeHandlers): () => void {
  const listener = (event: MessageEvent) => {
    if (event.origin !== host.location.origin) return;
    if (event.source !== host.parent) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if ((data as { source?: unknown }).source !== "claude-chess-shell") return;
    const msg = data as ShellMsg;
    switch (msg.type) {
      case "ping": {
        const reply: ReadyMsg = { source: "claude-chess-game", type: "ready" };
        host.postMessage(reply, host.location.origin);
        break;
      }
      case "request-state": {
        const r = handlers.onRequestState();
        const reply: StateMsg = { source: "claude-chess-game", type: "state", requestId: msg.requestId, state: r.state, summary: r.summary };
        host.postMessage(reply, host.location.origin);
        break;
      }
      case "load-state": {
        const r = handlers.onLoadState(msg.state);
        const reply: LoadedMsg = r.ok
          ? { source: "claude-chess-game", type: "loaded", requestId: msg.requestId, ok: true }
          : { source: "claude-chess-game", type: "loaded", requestId: msg.requestId, ok: false, error: r.error };
        host.postMessage(reply, host.location.origin);
        break;
      }
    }
  };

  host.addEventListener("message", listener);
  const ready: ReadyMsg = { source: "claude-chess-game", type: "ready" };
  host.postMessage(ready, host.location.origin);

  return () => host.removeEventListener("message", listener);
}
