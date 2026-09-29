import type { EngineRequestMessage, EngineResponseMessage } from "./messages";
import type { SearchRequest, SearchResult } from "./search";

interface PendingRequest {
  id: number;
  resolve: (result: SearchResult) => void;
  reject: (error: Error) => void;
}

/** Runs searches in a module worker so the page stays responsive. One request is in flight at a time. */
export class EngineClient {
  private worker: Worker;
  private pending: PendingRequest | null = null;
  private nextId = 1;

  constructor() {
    this.worker = this.spawn();
  }

  /**
   * Asks the engine for a move. A request made while another is running cancels the older one,
   * whose promise rejects with "cancelled".
   */
  requestMove(request: SearchRequest): Promise<SearchResult> {
    if (this.pending) this.cancel();
    const id = this.nextId++;
    return new Promise<SearchResult>((resolve, reject): void => {
      this.pending = { id, resolve, reject };
      const message: EngineRequestMessage = { id, request };
      this.worker.postMessage(message);
    });
  }

  /**
   * Abandons the running search. The worker is terminated and replaced because a synchronous
   * search cannot be interrupted, and a stale result must never reach the game.
   */
  cancel(): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    this.worker.terminate();
    this.worker = this.spawn();
    pending.reject(new Error("cancelled"));
  }

  private spawn(): Worker {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<EngineResponseMessage>): void => this.settle(event.data);
    worker.onerror = (event: ErrorEvent): void => {
      event.preventDefault();
      this.fail(new Error(event.message || "The engine worker failed"));
    };
    return worker;
  }

  private settle(message: EngineResponseMessage): void {
    const pending = this.pending;
    if (!pending || pending.id !== message.id) return;
    this.pending = null;
    if ("error" in message) pending.reject(new Error(message.error));
    else pending.resolve(message.result);
  }

  private fail(error: Error): void {
    const pending = this.pending;
    this.pending = null;
    pending?.reject(error);
  }
}
