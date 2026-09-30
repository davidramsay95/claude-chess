/**
 * The `window.postMessage` save-bridge protocol between this game and the
 * platform shell that hosts it in an iframe. See the project README for the
 * full protocol doc; this module implements the game's side of it.
 *
 * `handleBridgeMessage` is a pure function (no direct reference to `window`)
 * so it can be unit-tested with fabricated `MessageEvent`-shaped envelopes.
 * The real wiring (in `src/hooks/useSaveBridge.ts`) supplies `window`'s
 * actual `location.origin` / `parent` and a `postMessage` callback.
 */

import type { ExportedGameState, GameSummary } from "./gameRecord";

export const GAME_SOURCE = "claude-chess-game" as const;
export const SHELL_SOURCE = "claude-chess-shell" as const;

export interface ReadyMessage {
  source: typeof GAME_SOURCE;
  type: "ready";
}

export interface StateMessage {
  source: typeof GAME_SOURCE;
  type: "state";
  requestId: string;
  state: ExportedGameState | null;
  summary: GameSummary | null;
}

export interface LoadedMessage {
  source: typeof GAME_SOURCE;
  type: "loaded";
  requestId: string;
  ok: boolean;
  error?: string;
}

export type OutgoingBridgeMessage = ReadyMessage | StateMessage | LoadedMessage;

export interface PingMessage {
  source: typeof SHELL_SOURCE;
  type: "ping";
}

export interface RequestStateMessage {
  source: typeof SHELL_SOURCE;
  type: "request-state";
  requestId: string;
}

export interface LoadStateMessage {
  source: typeof SHELL_SOURCE;
  type: "load-state";
  requestId: string;
  state: unknown;
}

export type IncomingBridgeMessage = PingMessage | RequestStateMessage | LoadStateMessage;

function isIncomingBridgeMessage(data: unknown): data is IncomingBridgeMessage {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (obj.source !== SHELL_SOURCE) return false;
  return obj.type === "ping" || obj.type === "request-state" || obj.type === "load-state";
}

/** The bits of a real `MessageEvent` the handler cares about. */
export interface BridgeEnvelope {
  origin: string;
  source: unknown;
  data: unknown;
}

export type LoadStateResult = { ok: true } | { ok: false; error: string };

export interface BridgeCallbacks {
  /** The current game's export, or `null`/`null` if no game has started. */
  getState: () => { state: ExportedGameState | null; summary: GameSummary | null };
  /** Validates + replays `raw` and, on success, applies it as the current game. */
  loadState: (raw: unknown) => LoadStateResult;
  sendReady: () => void;
  sendState: (requestId: string, state: ExportedGameState | null, summary: GameSummary | null) => void;
  sendLoaded: (requestId: string, result: LoadStateResult) => void;
}

/**
 * Handles one incoming `postMessage` event per the save-bridge protocol.
 * Silently ignores anything that doesn't match exactly: wrong origin, wrong
 * `source` window, or a payload missing the expected `source`/`type` fields.
 */
export function handleBridgeMessage(
  envelope: BridgeEnvelope,
  expectedOrigin: string,
  expectedSource: unknown,
  callbacks: BridgeCallbacks,
): void {
  if (envelope.origin !== expectedOrigin) return;
  if (envelope.source !== expectedSource) return;
  if (!isIncomingBridgeMessage(envelope.data)) return;

  const message = envelope.data;
  switch (message.type) {
    case "ping":
      callbacks.sendReady();
      return;
    case "request-state": {
      const { state, summary } = callbacks.getState();
      callbacks.sendState(message.requestId, state, summary);
      return;
    }
    case "load-state": {
      const result = callbacks.loadState(message.state);
      callbacks.sendLoaded(message.requestId, result);
      return;
    }
  }
}
