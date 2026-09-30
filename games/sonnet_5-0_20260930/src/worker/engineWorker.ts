/**
 * Web Worker entry point wrapping the AI so the UI thread never blocks.
 * Phase 2 creates this with Vite's standard worker pattern:
 *
 *   new Worker(new URL("./engineWorker.ts", import.meta.url), { type: "module" })
 *
 * All the actual logic lives in `handleWorkerRequest`, a plain function with
 * no dependency on `self`/`postMessage`, so it can be unit-tested directly
 * (see `__tests__/handleWorkerRequest.test.ts`). Only the few lines at the
 * bottom of this file are untestable `self.onmessage` wiring.
 */

import { createGame, moveToUci } from "../engine/index";
import { findBestMove, type Difficulty } from "../ai/index";

export interface FindMoveRequest {
  type: "find-move";
  requestId: string;
  fen: string;
  difficulty: Difficulty;
  timeLimitMs?: number;
}

export type WorkerRequest = FindMoveRequest;

export interface MoveResponse {
  type: "move";
  requestId: string;
  uci: string;
}

export interface ErrorResponse {
  type: "error";
  requestId: string;
  message: string;
}

export type WorkerResponse = MoveResponse | ErrorResponse;

/**
 * Handles a single worker request and produces the response to post back.
 * Never throws: any failure (malformed FEN, no legal moves, etc.) is
 * reported as an `ErrorResponse` instead.
 */
export function handleWorkerRequest(request: FindMoveRequest): WorkerResponse {
  try {
    const state = createGame(request.fen);
    const move = findBestMove(state, request.difficulty, request.timeLimitMs);
    return { type: "move", requestId: request.requestId, uci: moveToUci(move) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { type: "error", requestId: request.requestId, message };
  }
}

/* istanbul ignore next -- thin glue, not unit-tested (see module docstring). */
// `self` inside a real Web Worker is a `DedicatedWorkerGlobalScope`, but this
// project's tsconfig uses the "DOM" lib (not "webworker", which conflicts
// with "DOM" on the global `self`/`postMessage` declarations). `Worker` is
// the closest DOM-lib type with a compatible `onmessage`/`postMessage`
// shape, so we cast through it purely for typechecking; at runtime this
// code only ever executes inside an actual worker.
if (typeof self !== "undefined") {
  const workerSelf = self as unknown as Worker;
  workerSelf.onmessage = (event: MessageEvent<FindMoveRequest>) => {
    const response = handleWorkerRequest(event.data);
    workerSelf.postMessage(response);
  };
}
