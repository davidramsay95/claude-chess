import type { GameState } from "./chess/types.js";

const GAME_SOURCE = "claude-chess-game";
const SHELL_SOURCE = "claude-chess-shell";

export interface BridgeCallbacks {
  getState: () => { state: GameState | null; summary: BridgeSummary | null };
  loadState: (state: GameState) => { ok: boolean; error?: string };
}

interface BridgeSummary {
  result: string;
  moveCount: number;
}

interface ShellMessage {
  source: string;
  type: string;
  requestId?: string;
  state?: GameState;
}

function sendToParent(msg: Record<string, unknown>): void {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(
      { ...msg, source: GAME_SOURCE },
      window.location.origin,
    );
  }
}

export function sendReady(): void {
  sendToParent({ type: "ready" });
}

export function initBridge(callbacks: BridgeCallbacks): () => void {
  const handler = (event: MessageEvent): void => {
    if (event.origin !== window.location.origin) return;
    if (event.source !== window.parent) return;

    const data = event.data as ShellMessage;
    if (!data || typeof data !== "object") return;
    if (data.source !== SHELL_SOURCE) return;

    switch (data.type) {
      case "ping": {
        sendToParent({ type: "ready" });
        break;
      }
      case "request-state": {
        const { state, summary } = callbacks.getState();
        sendToParent({
          type: "state",
          requestId: data.requestId,
          state,
          summary,
        });
        break;
      }
      case "load-state": {
        if (data.state === undefined || data.state === null) {
          sendToParent({
            type: "loaded",
            requestId: data.requestId,
            ok: false,
            error: "No state provided",
          });
          break;
        }
        const result = callbacks.loadState(data.state);
        sendToParent({
          type: "loaded",
          requestId: data.requestId,
          ok: result.ok,
          ...(result.error ? { error: result.error } : {}),
        });
        break;
      }
    }
  };

  window.addEventListener("message", handler);
  sendReady();

  return (): void => {
    window.removeEventListener("message", handler);
  };
}

export function validateGameState(
  raw: unknown,
): { valid: true; state: GameState } | { valid: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { valid: false, error: "State must be an object" };
  }

  const s = raw as Record<string, unknown>;

  if (s.version !== 1) {
    return { valid: false, error: "Unsupported version" };
  }

  if (typeof s.startFen !== "string" || s.startFen.length === 0) {
    return { valid: false, error: "Missing or invalid startFen" };
  }

  if (s.playerColor !== "white" && s.playerColor !== "black") {
    return { valid: false, error: "playerColor must be 'white' or 'black'" };
  }

  const validDiffs = ["easy", "medium", "hard", "expert"];
  if (!validDiffs.includes(s.difficulty as string)) {
    return { valid: false, error: "Invalid difficulty" };
  }

  if (!Array.isArray(s.moves)) {
    return { valid: false, error: "moves must be an array" };
  }

  for (let i = 0; i < s.moves.length; i++) {
    const m = s.moves[i];
    if (typeof m !== "string" || !/^[a-h][1-8][a-h][1-8][nbrq]?$/.test(m)) {
      return { valid: false, error: `Invalid move format at index ${i}: ${m}` };
    }
  }

  if (typeof s.resigned !== "boolean") {
    return { valid: false, error: "resigned must be a boolean" };
  }

  return {
    valid: true,
    state: {
      version: 1,
      startFen: s.startFen as string,
      playerColor: s.playerColor as "white" | "black",
      difficulty: s.difficulty as GameState["difficulty"],
      moves: s.moves as string[],
      resigned: s.resigned as boolean,
    },
  };
}
