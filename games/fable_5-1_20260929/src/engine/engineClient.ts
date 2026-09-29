import type { SearchRequest, SearchResponse, WorkerOutbound } from "./protocol";

export interface EngineClient {
  /** Resolves with the engine's reply. Starting a new search rejects any pending promise with Error("cancelled"). */
  search(request: Omit<SearchRequest, "type" | "id">): Promise<SearchResponse>;
  terminate(): void;
}

interface Pending {
  id: number;
  resolve: (response: SearchResponse) => void;
  reject: (error: Error) => void;
}

/** Main-thread handle on the engine worker. One search at a time; replies are matched by id. */
export const createEngineClient = (): EngineClient => {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  let nextId = 1;
  let pending: Pending | null = null;

  const settlePending = (error: Error): void => {
    if (pending) {
      pending.reject(error);
      pending = null;
    }
  };

  worker.onmessage = (event: MessageEvent<WorkerOutbound>): void => {
    const response = event.data;
    if (!response || response.type !== "result") return;
    if (!pending || pending.id !== response.id) return;
    const current = pending;
    pending = null;
    current.resolve(response);
  };

  worker.onerror = (event: ErrorEvent): void => {
    settlePending(new Error(event.message || "Engine worker failed"));
  };

  return {
    search: (request) => {
      settlePending(new Error("cancelled"));
      const id = nextId++;
      return new Promise<SearchResponse>((resolve, reject) => {
        pending = { id, resolve, reject };
        const message: SearchRequest = { type: "search", id, ...request };
        worker.postMessage(message);
      });
    },
    terminate: () => {
      settlePending(new Error("cancelled"));
      worker.terminate();
    },
  };
};
