import type { EngineRequestMessage, EngineResponseMessage } from "./messages";
import { findBestMove } from "./search";

/** The subset of DedicatedWorkerGlobalScope this worker uses. */
interface WorkerScope {
  onmessage: ((event: MessageEvent<EngineRequestMessage>) => void) | null;
  postMessage(message: EngineResponseMessage): void;
}

const scope = self as unknown as WorkerScope; // DOM lib types self as Window; this file runs as a DedicatedWorker

scope.onmessage = (event: MessageEvent<EngineRequestMessage>): void => {
  const { id, request } = event.data;
  try {
    scope.postMessage({ id, result: findBestMove(request) });
  } catch (error: unknown) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
