import { useCallback, useEffect, useRef } from "react";
import type { Difficulty } from "../ai/index";
import type { FindMoveRequest, WorkerResponse } from "../worker/engineWorker";

interface PendingRequest {
  resolve: (uci: string) => void;
  reject: (error: Error) => void;
}

/**
 * Owns the single Web Worker instance that runs the AI opponent, instantiated
 * with Vite's required `new URL(...)` pattern so the worker bundles and
 * resolves correctly under any `--base` path.
 */
export function useEngineWorker(): {
  requestMove: (fen: string, difficulty: Difficulty, timeLimitMs?: number) => Promise<string>;
} {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<string, PendingRequest>>(new Map());

  useEffect(() => {
    const worker = new Worker(new URL("../worker/engineWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const pending = pendingRef.current.get(response.requestId);
      if (!pending) return;
      pendingRef.current.delete(response.requestId);
      if (response.type === "move") {
        pending.resolve(response.uci);
      } else {
        pending.reject(new Error(response.message));
      }
    };
    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const requestMove = useCallback(
    (fen: string, difficulty: Difficulty, timeLimitMs?: number): Promise<string> => {
      return new Promise<string>((resolve, reject) => {
        const worker = workerRef.current;
        if (!worker) {
          reject(new Error("Engine worker is not ready yet."));
          return;
        }
        const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        pendingRef.current.set(requestId, { resolve, reject });
        const request: FindMoveRequest = { type: "find-move", requestId, fen, difficulty, timeLimitMs };
        worker.postMessage(request);
      });
    },
    [],
  );

  return { requestMove };
}
