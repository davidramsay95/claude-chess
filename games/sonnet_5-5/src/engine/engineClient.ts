import type { EngineRequest, EngineResponse, Level } from './engineTypes';

interface Pending {
  resolve: (response: EngineResponse) => void;
  reject: (reason: Error) => void;
}

/** Runs the engine in a Web Worker so search never blocks the UI thread. */
export class EngineClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor() {
    this.worker = this.spawnWorker();
  }

  requestMove(startFen: string, moves: string[], level: Level): Promise<EngineResponse> {
    const id = this.nextId++;
    const request: EngineRequest = { id, startFen, moves, level };
    return new Promise<EngineResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage(request);
    });
  }

  /** Aborts any running search. Pending requests reject with `Error('cancelled')`. */
  cancel(): void {
    this.worker.terminate();
    for (const { reject } of this.pending.values()) reject(new Error('cancelled'));
    this.pending.clear();
    this.worker = this.spawnWorker();
  }

  dispose(): void {
    this.cancel();
    this.worker.terminate();
  }

  private spawnWorker(): Worker {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<EngineResponse>): void => {
      const pending = this.pending.get(event.data.id);
      if (!pending) return;
      this.pending.delete(event.data.id);
      pending.resolve(event.data);
    };
    worker.onerror = (event: ErrorEvent): void => {
      const error = new Error(event.message || 'engine worker failed');
      for (const { reject } of this.pending.values()) reject(error);
      this.pending.clear();
    };
    return worker;
  }
}
