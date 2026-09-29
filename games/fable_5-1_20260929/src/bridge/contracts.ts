import type { GameSummary, SavedGameState } from "../state/contracts";

export const GAME_SOURCE = "claude-chess-game";
export const SHELL_SOURCE = "claude-chess-shell";

export type ShellMessage =
  | { source: typeof SHELL_SOURCE; type: "ping" }
  | { source: typeof SHELL_SOURCE; type: "request-state"; requestId: string }
  | { source: typeof SHELL_SOURCE; type: "load-state"; requestId: string; state: unknown };

export type GameMessage =
  | { source: typeof GAME_SOURCE; type: "ready" }
  | {
      source: typeof GAME_SOURCE;
      type: "state";
      requestId: string;
      state: SavedGameState | null;
      summary: GameSummary | null;
    }
  | { source: typeof GAME_SOURCE; type: "loaded"; requestId: string; ok: true }
  | { source: typeof GAME_SOURCE; type: "loaded"; requestId: string; ok: false; error: string };

/** What the interface gives the bridge so it can answer the shell. */
export interface BridgeHost {
  getState(): { state: SavedGameState | null; summary: GameSummary | null };
  /** Must validate fully and leave the current game untouched on failure. */
  loadState(state: unknown): { ok: true } | { ok: false; error: string };
}

/** The slice of `window` the bridge touches, so tests can pass a fake. */
export interface BridgeWindow {
  location: { origin: string };
  parent: { postMessage(message: unknown, targetOrigin: string): void };
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

export interface Bridge {
  /** Start listening and announce `ready`. */
  start(): void;
  stop(): void;
}
