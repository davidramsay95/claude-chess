/**
 * Talks to the search, which lives in a Web Worker so that thinking never
 * blocks the board. If a browser refuses to construct the worker the search is
 * imported and run inline instead, so the game still plays.
 */

import type { Difficulty } from "./engine/difficulty.ts";
import type { EngineResponse, MoveResponse, ThinkRequest } from "./worker/protocol.ts";

interface PendingRequest {
  resolve: (response: MoveResponse) => void;
  reject: (error: Error) => void;
}

export class EngineClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  constructor() {
    try {
      this.worker = new Worker(new URL("./worker/engine.worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.addEventListener("message", (event: MessageEvent<EngineResponse>) => {
        const response = event.data;
        const waiting = this.pending.get(response.id);
        if (!waiting) return;
        this.pending.delete(response.id);
        if (response.type === "error") waiting.reject(new Error(response.message));
        else waiting.resolve(response);
      });
      this.worker.addEventListener("error", () => this.failAll("the engine worker stopped"));
    } catch {
      this.worker = null;
    }
  }

  private failAll(reason: string): void {
    for (const waiting of this.pending.values()) waiting.reject(new Error(reason));
    this.pending.clear();
    this.worker = null;
  }

  async think(
    startFen: string,
    moves: readonly string[],
    difficulty: Difficulty,
  ): Promise<MoveResponse> {
    const request: ThinkRequest = {
      type: "think",
      id: this.nextId++,
      startFen,
      moves: [...moves],
      difficulty,
    };
    const worker = this.worker;
    if (!worker) {
      const { think } = await import("./worker/think.ts");
      return think(request);
    }
    return new Promise<MoveResponse>((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject });
      worker.postMessage(request);
    });
  }
}
