import {
  type Bridge,
  type BridgeHost,
  type BridgeWindow,
  GAME_SOURCE,
  type GameMessage,
  SHELL_SOURCE,
  type ShellMessage,
} from "./contracts";

const SHELL_TYPES = new Set<string>(["ping", "request-state", "load-state"]);

export const isShellMessage = (data: unknown): data is ShellMessage => {
  if (typeof data !== "object" || data === null) return false;
  const record = data as Record<string, unknown>;
  if (record.source !== SHELL_SOURCE) return false;
  if (typeof record.type !== "string" || !SHELL_TYPES.has(record.type)) return false;
  return record.type === "ping" || typeof record.requestId === "string";
};

/**
 * Speaks the save bridge protocol with the hosting shell. Everything not from
 * the parent window at the same origin is ignored, so a stray or hostile
 * message can never read or replace the game.
 */
export const createBridge = (win: BridgeWindow, host: BridgeHost): Bridge => {
  const send = (message: GameMessage): void => {
    win.parent.postMessage(message, win.location.origin);
  };

  const answer = (message: ShellMessage): void => {
    switch (message.type) {
      case "ping":
        send({ source: GAME_SOURCE, type: "ready" });
        return;
      case "request-state": {
        const { state, summary } = host.getState();
        send({ source: GAME_SOURCE, type: "state", requestId: message.requestId, state, summary });
        return;
      }
      case "load-state": {
        let outcome: ReturnType<BridgeHost["loadState"]>;
        try {
          outcome = host.loadState(message.state);
        } catch (error) {
          outcome = { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
        if (outcome.ok) {
          send({ source: GAME_SOURCE, type: "loaded", requestId: message.requestId, ok: true });
        } else {
          send({ source: GAME_SOURCE, type: "loaded", requestId: message.requestId, ok: false, error: outcome.error });
        }
        return;
      }
    }
  };

  const listener = (event: MessageEvent): void => {
    if (event.origin !== win.location.origin) return;
    if (event.source !== win.parent) return;
    if (!isShellMessage(event.data)) return;
    answer(event.data);
  };

  return {
    start: () => {
      win.addEventListener("message", listener);
      send({ source: GAME_SOURCE, type: "ready" });
    },
    stop: () => {
      win.removeEventListener("message", listener);
    },
  };
};
