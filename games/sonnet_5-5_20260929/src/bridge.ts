import type { Session } from "./session";

const GAME_SOURCE = "claude-chess-game";
const SHELL_SOURCE = "claude-chess-shell";

/** The slice of `window` the bridge depends on, so tests can pass a fake. */
export interface BridgeWindow {
  location: { origin: string };
  parent: { postMessage: (message: unknown, targetOrigin: string) => void };
  addEventListener: (type: "message", listener: (event: MessageEvent) => void) => void;
}

interface ShellMessage {
  source: typeof SHELL_SOURCE;
  type: string;
  requestId?: unknown;
  state?: unknown;
}

const isShellMessage = (data: unknown): data is ShellMessage =>
  typeof data === "object" &&
  data !== null &&
  (data as Record<string, unknown>).source === SHELL_SOURCE &&
  typeof (data as Record<string, unknown>).type === "string";

/**
 * Answers the save bridge protocol from the hosting shell. Only messages from
 * the same origin and from the parent window are honoured.
 */
export const createBridge = (win: BridgeWindow, session: Session): void => {
  const post = (message: Record<string, unknown>): void => {
    // Standalone, the parent is the window itself; there is no shell to tell.
    if (win.parent === (win as unknown)) return;
    try {
      win.parent.postMessage({ source: GAME_SOURCE, ...message }, win.location.origin);
    } catch {
      // An opaque origin (file://) cannot be targeted; the shell cannot be reached either.
    }
  };

  win.addEventListener("message", (event: MessageEvent) => {
    if (event.origin !== win.location.origin || event.source !== win.parent) return;
    const data: unknown = event.data;
    if (!isShellMessage(data)) return;

    if (data.type === "ping") {
      post({ type: "ready" });
    } else if (data.type === "request-state") {
      post({ type: "state", requestId: data.requestId, state: session.snapshot(), summary: session.summary() });
    } else if (data.type === "load-state") {
      const outcome = session.load(data.state);
      post(
        outcome.ok
          ? { type: "loaded", requestId: data.requestId, ok: true }
          : { type: "loaded", requestId: data.requestId, ok: false, error: outcome.error },
      );
    }
  });

  post({ type: "ready" });
};
