/** Message shape received from the host page; only the fields the bridge checks. */
export interface BridgeEvent {
  origin: string;
  source: unknown;
  data: unknown;
}

export interface BridgeWindow {
  location: { origin: string };
  parent: { postMessage(message: unknown, targetOrigin: string): void };
  addEventListener(type: "message", listener: (event: BridgeEvent) => void): void;
}

export interface SaveSummary {
  result: "1-0" | "0-1" | "1/2-1/2" | "*";
  moveCount: number;
}

export interface SaveSnapshot {
  state: unknown;
  summary: SaveSummary;
}

export interface SaveBridgeDeps {
  /** Returns null when no game has started, so there is nothing to save. */
  getSave(): SaveSnapshot | null;
  /** Throws with a short message when the state is invalid, leaving the current game untouched. */
  loadState(state: unknown): void;
}

const GAME = "claude-chess-game";
const SHELL = "claude-chess-shell";

/** Answers save and restore requests from the same-origin host page that embeds this game. */
export const startSaveBridge = (win: BridgeWindow, deps: SaveBridgeDeps): void => {
  // A top-level window is its own parent; there is no host to talk to.
  if ((win.parent as unknown) === win) return;
  const origin = win.location.origin;
  const reply = (type: string, fields: object = {}): void =>
    win.parent.postMessage({ source: GAME, type, ...fields }, origin);

  win.addEventListener("message", (event) => {
    if (event.origin !== origin || event.source !== win.parent) return;
    const data = event.data;
    if (typeof data !== "object" || data === null) return;
    const message = data as Record<string, unknown>; // Narrowed to an object above; fields are checked individually below.
    if (message.source !== SHELL) return;
    if (message.type === "ping") return reply("ready");
    const requestId = message.requestId;
    if (typeof requestId !== "string") return;
    if (message.type === "request-state") {
      const save = deps.getSave();
      return reply("state", { requestId, state: save?.state ?? null, summary: save?.summary ?? null });
    }
    if (message.type === "load-state") {
      try {
        deps.loadState(message.state);
        reply("loaded", { requestId, ok: true });
      } catch (err) {
        reply("loaded", { requestId, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
  });
  reply("ready");
};
