import { describe, it, expect, vi } from "vitest";
import { installBridge } from "../src/bridge.js";

function makeHost() {
  let listener: ((e: MessageEvent) => void) | null = null;
  const posted: unknown[] = [];
  const parent = { __marker: "parent" };
  const host = {
    location: { origin: "https://example.test" },
    parent,
    addEventListener: vi.fn((_t: string, l: (e: MessageEvent) => void) => { listener = l; }),
    removeEventListener: vi.fn(() => { listener = null; }),
    postMessage: (msg: unknown, target: string) => posted.push({ msg, target }),
  };
  const fire = (data: unknown, origin: string, source: unknown) => {
    listener?.({ data, origin, source } as unknown as MessageEvent);
  };
  return { host, posted, parent, fire };
}

describe("bridge", () => {
  it("sends ready on install", () => {
    const { host, posted } = makeHost();
    installBridge(host, {
      onRequestState: () => ({ state: null, summary: null }),
      onLoadState: () => ({ ok: true }),
    });
    expect(posted).toContainEqual({
      msg: { source: "claude-chess-game", type: "ready" },
      target: "https://example.test",
    });
  });

  it("answers ping with ready", () => {
    const { host, posted, parent, fire } = makeHost();
    installBridge(host, {
      onRequestState: () => ({ state: null, summary: null }),
      onLoadState: () => ({ ok: true }),
    });
    posted.length = 0;
    fire({ source: "claude-chess-shell", type: "ping" }, host.location.origin, parent);
    expect(posted).toContainEqual({
      msg: { source: "claude-chess-game", type: "ready" },
      target: "https://example.test",
    });
  });

  it("answers request-state with the handler's state and summary", () => {
    const { host, posted, parent, fire } = makeHost();
    installBridge(host, {
      onRequestState: () => ({
        state: { version: 1, startFen: "x", playerColor: "white", difficulty: "medium", moves: [], resigned: false },
        summary: { result: "*", moveCount: 0 },
      }),
      onLoadState: () => ({ ok: true }),
    });
    posted.length = 0;
    fire({ source: "claude-chess-shell", type: "request-state", requestId: "r1" }, host.location.origin, parent);
    expect(posted.length).toBe(1);
    const pm = posted[0] as { msg: { type: string; requestId: string; state: unknown; summary: unknown } };
    expect(pm.msg.type).toBe("state");
    expect(pm.msg.requestId).toBe("r1");
    expect(pm.msg.state).toBeTruthy();
    expect(pm.msg.summary).toEqual({ result: "*", moveCount: 0 });
  });

  it("answers load-state with ok:true on success", () => {
    const { host, posted, parent, fire } = makeHost();
    installBridge(host, {
      onRequestState: () => ({ state: null, summary: null }),
      onLoadState: () => ({ ok: true }),
    });
    posted.length = 0;
    fire({ source: "claude-chess-shell", type: "load-state", requestId: "r2", state: {} }, host.location.origin, parent);
    expect(posted.length).toBe(1);
    expect(posted[0]).toEqual({
      msg: { source: "claude-chess-game", type: "loaded", requestId: "r2", ok: true },
      target: "https://example.test",
    });
  });

  it("answers load-state with ok:false + error on failure", () => {
    const { host, posted, parent, fire } = makeHost();
    installBridge(host, {
      onRequestState: () => ({ state: null, summary: null }),
      onLoadState: () => ({ ok: false, error: "bad" }),
    });
    posted.length = 0;
    fire({ source: "claude-chess-shell", type: "load-state", requestId: "r3", state: {} }, host.location.origin, parent);
    expect(posted[0]).toEqual({
      msg: { source: "claude-chess-game", type: "loaded", requestId: "r3", ok: false, error: "bad" },
      target: "https://example.test",
    });
  });

  it("ignores messages from the wrong origin", () => {
    const { host, posted, parent, fire } = makeHost();
    installBridge(host, {
      onRequestState: () => ({ state: null, summary: null }),
      onLoadState: () => ({ ok: true }),
    });
    posted.length = 0;
    fire({ source: "claude-chess-shell", type: "ping" }, "https://evil.test", parent);
    expect(posted.length).toBe(0);
  });

  it("ignores messages from the wrong source window", () => {
    const { host, posted, fire } = makeHost();
    installBridge(host, {
      onRequestState: () => ({ state: null, summary: null }),
      onLoadState: () => ({ ok: true }),
    });
    posted.length = 0;
    fire({ source: "claude-chess-shell", type: "ping" }, host.location.origin, { not: "parent" });
    expect(posted.length).toBe(0);
  });

  it("ignores messages without the shell source tag", () => {
    const { host, posted, parent, fire } = makeHost();
    installBridge(host, {
      onRequestState: () => ({ state: null, summary: null }),
      onLoadState: () => ({ ok: true }),
    });
    posted.length = 0;
    fire({ source: "attacker", type: "ping" }, host.location.origin, parent);
    fire("just a string", host.location.origin, parent);
    fire({ type: "ping" }, host.location.origin, parent);
    expect(posted.length).toBe(0);
  });
});
