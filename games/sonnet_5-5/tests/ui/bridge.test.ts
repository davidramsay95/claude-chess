import { describe, expect, it, vi } from 'vitest';
import { createBridge, type BridgeDeps, type BridgeEvent, type MessageTarget } from '../../src/ui/bridge';

const ORIGIN = 'https://chess.test';

const setup = (overrides: Partial<BridgeDeps> = {}) => {
  const parent: MessageTarget = { postMessage: vi.fn() };
  const deps: BridgeDeps = {
    origin: ORIGIN,
    parent,
    getState: () => ({ state: { moves: ['e2e4'] }, summary: { result: '*', moveCount: 1 } }),
    loadState: vi.fn(),
    ...overrides,
  };
  const bridge = createBridge(deps);
  const send = (data: unknown, extra: Partial<BridgeEvent> = {}): void =>
    bridge.handle({ origin: ORIGIN, source: parent, data, ...extra });
  return { parent, deps, bridge, send, posted: () => (parent.postMessage as ReturnType<typeof vi.fn>).mock.calls };
};

const shell = (type: string, extra: object = {}) => ({ source: 'claude-chess-shell', type, ...extra });

describe('save bridge', () => {
  it('announces ready to the parent with the exact origin', () => {
    const { bridge, posted } = setup();
    bridge.announceReady();
    expect(posted()).toEqual([[{ source: 'claude-chess-game', type: 'ready' }, ORIGIN]]);
  });

  it('replies to ping with ready', () => {
    const { send, posted } = setup();
    send(shell('ping'));
    expect(posted()).toEqual([[{ source: 'claude-chess-game', type: 'ready' }, ORIGIN]]);
  });

  it('replies to request-state with state and summary, echoing requestId', () => {
    const { send, posted } = setup();
    send(shell('request-state', { requestId: 'r1' }));
    expect(posted()).toEqual([
      [
        {
          source: 'claude-chess-game',
          type: 'state',
          requestId: 'r1',
          state: { moves: ['e2e4'] },
          summary: { result: '*', moveCount: 1 },
        },
        ORIGIN,
      ],
    ]);
  });

  it('sends null state and summary when no game has started', () => {
    const { send, posted } = setup({ getState: () => null });
    send(shell('request-state', { requestId: 'r2' }));
    expect(posted()[0][0]).toMatchObject({ type: 'state', requestId: 'r2', state: null, summary: null });
  });

  it('loads state and replies ok true', () => {
    const loadState = vi.fn();
    const { send, posted } = setup({ loadState });
    send(shell('load-state', { requestId: 'r3', state: { moves: [] } }));
    expect(loadState).toHaveBeenCalledWith({ moves: [] });
    expect(posted()).toEqual([[{ source: 'claude-chess-game', type: 'loaded', requestId: 'r3', ok: true }, ORIGIN]]);
  });

  it('replies ok false with the error message when loading throws', () => {
    const { send, posted } = setup({
      loadState: () => {
        throw new Error('Illegal move at ply 3');
      },
    });
    send(shell('load-state', { requestId: 'r4', state: 'junk' }));
    expect(posted()).toEqual([
      [{ source: 'claude-chess-game', type: 'loaded', requestId: 'r4', ok: false, error: 'Illegal move at ply 3' }, ORIGIN],
    ]);
  });

  it('ignores messages from another origin', () => {
    const { send, posted } = setup();
    send(shell('ping'), { origin: 'https://evil.test' });
    expect(posted()).toEqual([]);
  });

  it('ignores messages from a source other than the parent', () => {
    const { send, posted } = setup();
    send(shell('ping'), { source: {} });
    expect(posted()).toEqual([]);
  });

  it.each([null, 'ping', 42, {}, { type: 'ping' }, { source: 'other', type: 'ping' }, shell('unknown')])(
    'ignores malformed or unknown message %j',
    (data) => {
      const { send, posted } = setup();
      send(data);
      expect(posted()).toEqual([]);
    },
  );

  it('ignores request-state without a string requestId', () => {
    const { send, posted } = setup();
    send(shell('request-state'));
    expect(posted()).toEqual([]);
  });
});
