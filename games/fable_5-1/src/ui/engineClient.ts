import type { SearchRequest, WorkerOutbound } from "../engine/protocol";
import type { Difficulty } from "../engine/search";
import type { MoveProvider } from "./game";

interface PendingSearch {
  id: number;
  resolve: (uci: string) => void;
  reject: (reason: Error) => void;
}

/** Talks to the engine worker; only the most recent request can be answered, older replies are dropped. */
export class EngineClient implements MoveProvider {
  private nextId = 0;
  private pending: PendingSearch | null = null;
  private readonly worker: Worker;

  constructor(worker: Worker) {
    this.worker = worker;
    worker.addEventListener("message", this.onMessage);
    worker.addEventListener("error", this.onError);
  }

  requestMove(startFen: string, moves: string[], difficulty: Difficulty): Promise<string> {
    this.pending?.reject(new Error("Superseded by a newer search"));
    const id = ++this.nextId;
    const request: SearchRequest = { type: "search", id, startFen, moves, difficulty };
    return new Promise<string>((resolve, reject) => {
      this.pending = { id, resolve, reject };
      this.worker.postMessage(request);
    });
  }

  terminate(): void {
    this.pending?.reject(new Error("Engine terminated"));
    this.pending = null;
    this.worker.removeEventListener("message", this.onMessage);
    this.worker.removeEventListener("error", this.onError);
    this.worker.terminate();
  }

  private readonly onMessage = (event: MessageEvent<WorkerOutbound>): void => {
    const message = event.data;
    const pending = this.pending;
    if (pending === null || message.id !== pending.id) return;
    this.pending = null;
    if (message.type === "result") pending.resolve(message.move);
    else pending.reject(new Error(message.message));
  };

  private readonly onError = (event: ErrorEvent): void => {
    const pending = this.pending;
    if (pending === null) return;
    this.pending = null;
    pending.reject(new Error(event.message || "Engine worker crashed"));
  };
}
