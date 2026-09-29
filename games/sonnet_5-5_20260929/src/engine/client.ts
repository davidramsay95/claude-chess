import type { SearchRequest, SearchResponse } from "./protocol";
import type { Difficulty } from "../state";

/**
 * Runs searches in a Web Worker so the interface never freezes. Cancelling
 * terminates the worker; a fresh one is started on the next search.
 */
export class EngineClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending: { id: number; resolve: (move: string | null) => void } | null = null;

  /** Resolves with the engine's move in UCI, null when there is no legal move, or "cancelled" content as null after cancel(). */
  search(startFen: string, moves: string[], difficulty: Difficulty): Promise<string | null> {
    this.cancel();
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending = { id, resolve };
      const request: SearchRequest = { id, startFen, moves, difficulty };
      worker.postMessage(request);
    });
  }

  /** Abandons the running search. The promise from `search` resolves with null. */
  cancel(): void {
    if (this.pending === null) return;
    const { resolve } = this.pending;
    this.pending = null;
    this.worker?.terminate();
    this.worker = null;
    resolve(null);
  }

  private ensureWorker(): Worker {
    if (this.worker !== null) return this.worker;
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<SearchResponse>): void => {
      const pending = this.pending;
      if (pending === null || pending.id !== event.data.id) return;
      this.pending = null;
      pending.resolve(event.data.move);
    };
    this.worker = worker;
    return worker;
  }
}
