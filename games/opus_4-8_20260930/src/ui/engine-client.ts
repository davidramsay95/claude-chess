import { Difficulty } from "../game/types.ts";
import { EngineOutbound, SearchRequest, SearchResponse } from "../worker/protocol.ts";

/**
 * Main-thread handle to the engine worker. Serialises the position to FEN,
 * tags each request, and resolves only the newest request so a superseded
 * search (after undo or a new game) can never play a stale move.
 */
export class EngineClient {
  private worker: Worker;
  private nextId = 1;
  private pending: {
    id: number;
    resolve: (r: SearchResponse) => void;
    reject: (e: Error) => void;
  } | null = null;

  constructor() {
    this.worker = new Worker(new URL("../worker/engine.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (event: MessageEvent<EngineOutbound>) => this.handle(event.data);
    this.worker.onerror = (event) => {
      if (this.pending) {
        this.pending.reject(new Error(event.message || "Engine worker error"));
        this.pending = null;
      }
    };
  }

  private handle(message: EngineOutbound): void {
    if (!this.pending || message.requestId !== this.pending.id) return; // stale
    const pending = this.pending;
    this.pending = null;
    if (message.type === "error") {
      pending.reject(new Error(message.error));
    } else {
      pending.resolve(message);
    }
  }

  /** Request a move for `fen` at `difficulty`. Supersedes any pending search. */
  search(fen: string, difficulty: Difficulty): Promise<SearchResponse> {
    if (this.pending) {
      this.pending.reject(new Error("Search superseded"));
      this.pending = null;
    }
    const id = this.nextId++;
    const request: SearchRequest = { type: "search", requestId: id, fen, difficulty };
    return new Promise<SearchResponse>((resolve, reject) => {
      this.pending = { id, resolve, reject };
      this.worker.postMessage(request);
    });
  }

  /** Ignore any in-flight result (e.g. the user started a new game). */
  cancel(): void {
    if (this.pending) {
      this.pending.reject(new Error("Search cancelled"));
      this.pending = null;
    }
  }

  dispose(): void {
    this.cancel();
    this.worker.terminate();
  }
}
