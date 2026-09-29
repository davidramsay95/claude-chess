import { describe, expect, it } from "vitest";
import { createEngineClient, type EngineWorker } from "./engineClient";
import type { EngineRequest, EngineResponse } from "./protocol";

class FakeWorker implements EngineWorker {
  readonly sent: EngineRequest[] = [];
  terminated = false;
  private listener: ((event: MessageEvent<EngineResponse>) => void) | null = null;

  postMessage(message: EngineRequest): void {
    this.sent.push(message);
  }

  addEventListener(_type: "message", listener: (event: MessageEvent<EngineResponse>) => void): void {
    this.listener = listener;
  }

  terminate(): void {
    this.terminated = true;
  }

  reply(response: EngineResponse): void {
    // The client only reads `data`, so a partial event is sufficient here.
    this.listener?.({ data: response } as MessageEvent<EngineResponse>);
  }
}

const REQUEST = { startFen: "start", moves: ["e2e4"], difficulty: "easy" } as const;

describe("createEngineClient", () => {
  it("resolves with the move from the matching response", async () => {
    const worker = new FakeWorker();
    const client = createEngineClient(() => worker);
    const pending = client.requestMove(REQUEST);
    const { id } = worker.sent[0];
    worker.reply({ id, ok: true, move: "e7e5" });
    await expect(pending).resolves.toBe("e7e5");
  });

  it("rejects when the worker reports an error", async () => {
    const worker = new FakeWorker();
    const client = createEngineClient(() => worker);
    const pending = client.requestMove(REQUEST);
    worker.reply({ id: worker.sent[0].id, ok: false, error: "boom" });
    await expect(pending).rejects.toThrow("boom");
  });

  it("routes concurrent responses by id", async () => {
    const worker = new FakeWorker();
    const client = createEngineClient(() => worker);
    const first = client.requestMove(REQUEST);
    const second = client.requestMove(REQUEST);
    worker.reply({ id: worker.sent[1].id, ok: true, move: "b" });
    worker.reply({ id: worker.sent[0].id, ok: true, move: "a" });
    await expect(first).resolves.toBe("a");
    await expect(second).resolves.toBe("b");
  });

  it("rejects pending requests and stops the worker on terminate", async () => {
    const worker = new FakeWorker();
    const client = createEngineClient(() => worker);
    const pending = client.requestMove(REQUEST);
    client.terminate();
    await expect(pending).rejects.toThrow(/terminated/);
    expect(worker.terminated).toBe(true);
  });
});
