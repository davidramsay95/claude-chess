import type { EngineRequest, EngineResponse, MoveRequest } from "./protocol";

/** The subset of the Worker API the client relies on, so tests can substitute a fake. */
export interface EngineWorker {
  postMessage(message: EngineRequest): void;
  addEventListener(type: "message", listener: (event: MessageEvent<EngineResponse>) => void): void;
  terminate(): void;
}

export interface EngineClient {
  /** Resolves with the engine's chosen move in UCI notation. */
  requestMove(request: MoveRequest): Promise<string>;
  terminate(): void;
}

interface PendingRequest {
  resolve: (move: string) => void;
  reject: (error: Error) => void;
}

const createBrowserWorker = (): EngineWorker =>
  new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });

/** Runs the engine in a Web Worker so searching never blocks the UI thread. */
export const createEngineClient = (createWorker: () => EngineWorker = createBrowserWorker): EngineClient => {
  const worker = createWorker();
  const pending = new Map<number, PendingRequest>();
  let nextId = 1;

  worker.addEventListener("message", (event) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if (response.ok) request.resolve(response.move);
    else request.reject(new Error(response.error));
  });

  return {
    requestMove: (request) =>
      new Promise<string>((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        worker.postMessage({ ...request, id });
      }),
    terminate: () => {
      worker.terminate();
      for (const request of pending.values()) request.reject(new Error("Engine terminated"));
      pending.clear();
    },
  };
};
