import { summarizeSavedGame, type SavedGame } from "./savedGame";

const GAME_SOURCE = "claude-chess-game";
const SHELL_SOURCE = "claude-chess-shell";

export interface BridgeDeps {
  /** Origin of this page; the only origin accepted and targeted. */
  origin: string;
  /** The embedding window, also the only accepted message source. */
  parent: { postMessage: (message: unknown, targetOrigin: string) => void };
  /** Current game, or null when none has started. */
  getState: () => SavedGame | null;
  /** Replaces the current game; must throw without side effects when the state is invalid. */
  loadState: (state: unknown) => void;
}

export interface BridgeMessageEvent {
  data: unknown;
  origin: string;
  source: unknown;
}

export interface Bridge {
  announceReady: () => void;
  handleMessage: (event: BridgeMessageEvent) => void;
}

const isShellMessage = (data: unknown): data is { type: unknown; requestId?: unknown; state?: unknown } =>
  typeof data === "object" && data !== null && (data as Record<string, unknown>).source === SHELL_SOURCE;

/** Pure message handling for the save bridge; the window wiring lives in useSaveBridge. */
export const createBridge = ({ origin, parent, getState, loadState }: BridgeDeps): Bridge => {
  const reply = (message: object): void => parent.postMessage({ source: GAME_SOURCE, ...message }, origin);
  const announceReady = (): void => reply({ type: "ready" });

  const handleMessage = (event: BridgeMessageEvent): void => {
    if (event.origin !== origin || event.source !== parent || !isShellMessage(event.data)) return;
    const { type, requestId, state } = event.data;
    if (type === "ping") announceReady();
    else if (type === "request-state") {
      const saved = getState();
      reply({ type: "state", requestId, state: saved, summary: saved && summarizeSavedGame(saved) });
    } else if (type === "load-state") {
      try {
        loadState(state);
        reply({ type: "loaded", requestId, ok: true });
      } catch (error) {
        reply({ type: "loaded", requestId, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
  };

  return { announceReady, handleMessage };
};
