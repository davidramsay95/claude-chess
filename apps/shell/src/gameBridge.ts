/** Result of a finished or unfinished game as reported by the game. */
export type GameResult = "1-0" | "0-1" | "1/2-1/2" | "*";

export interface GameStateSummary {
  result: GameResult;
  moveCount: number;
}

export interface GameStateReply {
  state: unknown;
  summary: GameStateSummary;
}

export interface BridgeOptions {
  timeoutMs?: number;
}

const GAME_SOURCE = "claude-chess-game";
const SHELL_SOURCE = "claude-chess-shell";
export const DEFAULT_BRIDGE_TIMEOUT_MS = 3000;
export const DEFAULT_FRAME_LOAD_TIMEOUT_MS = 10000;

const RESULTS: readonly string[] = ["1-0", "0-1", "1/2-1/2", "*"];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isSummary = (value: unknown): value is GameStateSummary =>
  isRecord(value) && typeof value.result === "string" && RESULTS.includes(value.result) && typeof value.moveCount === "number";

const timeoutError = (): Error => new Error("The game did not respond in time. Reload the page and try again.");

/** Returns the frame's window, or throws when the game is not mounted yet. */
const gameWindow = (frame: HTMLIFrameElement): Window => {
  if (frame.contentWindow === null) {
    throw new Error("The game window is not available.");
  }
  return frame.contentWindow;
};

/** Sends a shell message; the explicit origin keeps saved state from leaking to another site. */
const post = (frame: HTMLIFrameElement, message: Record<string, unknown>): void => {
  gameWindow(frame).postMessage({ source: SHELL_SOURCE, ...message }, window.location.origin);
};

/** Accepts only messages the protocol allows: same origin, from this frame, tagged as the game. */
const readGameMessage = (event: MessageEvent, frame: HTMLIFrameElement): Record<string, unknown> | null => {
  if (event.origin !== window.location.origin) return null;
  if (event.source === null || event.source !== frame.contentWindow) return null;
  if (!isRecord(event.data) || event.data.source !== GAME_SOURCE) return null;
  return event.data;
};

/**
 * Listens for game messages until `onMessage` returns a settle callback, or the timeout fires.
 * `start` runs after the listener is attached so an instant reply cannot be missed.
 */
const awaitGameMessage = <T>(
  frame: HTMLIFrameElement,
  timeoutMs: number,
  onMessage: (message: Record<string, unknown>) => ((resolve: (value: T) => void, reject: (error: Error) => void) => void) | null,
  start: (registerLoadHandler: (handler: () => void) => void) => void,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const loadHandlers: Array<() => void> = [];
    const onLoad = (): void => {
      for (const handler of loadHandlers) handler();
    };
    const finish = (): void => {
      window.clearTimeout(timer);
      window.removeEventListener("message", listener);
      frame.removeEventListener("load", onLoad);
    };
    const listener = (event: MessageEvent): void => {
      const message = readGameMessage(event, frame);
      if (message === null) return;
      const settle = onMessage(message);
      if (settle === null) return;
      finish();
      settle(resolve, reject);
    };
    const timer = window.setTimeout(() => {
      finish();
      reject(timeoutError());
    }, timeoutMs);

    window.addEventListener("message", listener);
    frame.addEventListener("load", onLoad);
    try {
      start((handler) => loadHandlers.push(handler));
    } catch (error) {
      finish();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });

/**
 * Asks the game for its exportable state.
 * Resolves null when the game has nothing to save yet.
 */
export const requestState = (
  frame: HTMLIFrameElement,
  { timeoutMs = DEFAULT_BRIDGE_TIMEOUT_MS }: BridgeOptions = {},
): Promise<GameStateReply | null> => {
  const requestId = crypto.randomUUID();
  return awaitGameMessage<GameStateReply | null>(
    frame,
    timeoutMs,
    (message) => {
      if (message.type !== "state" || message.requestId !== requestId) return null;
      return (resolve, reject) => {
        if (message.state === null || message.state === undefined) {
          resolve(null);
        } else if (isSummary(message.summary)) {
          resolve({ state: message.state, summary: message.summary });
        } else {
          reject(new Error("The game sent a save that could not be read."));
        }
      };
    },
    () => post(frame, { type: "request-state", requestId }),
  );
};

/**
 * Hands a saved state to the game.
 * Rejects with the game's own error text when it refuses the state.
 */
export const loadState = (
  frame: HTMLIFrameElement,
  state: unknown,
  { timeoutMs = DEFAULT_BRIDGE_TIMEOUT_MS }: BridgeOptions = {},
): Promise<void> => {
  const requestId = crypto.randomUUID();
  return awaitGameMessage<void>(
    frame,
    timeoutMs,
    (message) => {
      if (message.type !== "loaded" || message.requestId !== requestId) return null;
      return (resolve, reject) => {
        if (message.ok === true) {
          resolve();
        } else {
          const reason = typeof message.error === "string" && message.error !== "" ? message.error : "The game could not load this save.";
          reject(new Error(reason));
        }
      };
    },
    () => post(frame, { type: "load-state", requestId, state }),
  );
};

/**
 * Resolves once the game reports ready.
 * Pings now and after every frame load, because a `ready` sent before we listened is lost.
 */
export const waitForReady = (
  frame: HTMLIFrameElement,
  { timeoutMs = DEFAULT_BRIDGE_TIMEOUT_MS }: BridgeOptions = {},
): Promise<void> =>
  awaitGameMessage<void>(
    frame,
    timeoutMs,
    (message) => (message.type === "ready" ? (resolve) => resolve() : null),
    (onLoad) => {
      post(frame, { type: "ping" });
      // A load in flight replaces the window, so the earlier ping may have hit the old page.
      onLoad(() => post(frame, { type: "ping" }));
    },
  );

/** Resolves on the frame's next `load` event. Call it before triggering the navigation. */
export const waitForFrameLoad = (
  frame: HTMLIFrameElement,
  { timeoutMs = DEFAULT_FRAME_LOAD_TIMEOUT_MS }: BridgeOptions = {},
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const onLoad = (): void => {
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(() => {
      frame.removeEventListener("load", onLoad);
      reject(new Error("The game page did not finish loading in time."));
    }, timeoutMs);
    frame.addEventListener("load", onLoad, { once: true });
  });
