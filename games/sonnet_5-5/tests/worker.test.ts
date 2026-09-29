import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EngineRequest, EngineResponse } from '../src/engine/engineTypes';
import { Game } from '../src/engine/game';

type Handler = (event: MessageEvent<EngineRequest>) => void;

const runWorker = async (request: EngineRequest): Promise<EngineResponse> => {
  const posted: EngineResponse[] = [];
  const fakeSelf = { onmessage: null as Handler | null, postMessage: (r: EngineResponse): void => void posted.push(r) };
  vi.stubGlobal('self', fakeSelf);
  vi.resetModules();
  await import('../src/engine/worker');
  fakeSelf.onmessage?.({ data: request } as MessageEvent<EngineRequest>);
  return posted[0];
};

afterEach(() => vi.unstubAllGlobals());

describe('engine worker', () => {
  it('replies with a legal move in coordinate notation', async () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const response = await runWorker({ id: 5, startFen: start, moves: ['e2e4'], level: 'easy' });
    expect(response.id).toBe(5);
    const game = new Game();
    game.play(game.parseUci('e2e4') as number);
    expect(game.parseUci(response.move as string)).toBeDefined();
    expect(response.info?.nodes).toBeGreaterThanOrEqual(0);
  });

  it('returns null when the game is over', async () => {
    const response = await runWorker({
      id: 1,
      startFen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1',
      moves: [],
      level: 'hard',
    });
    expect(response.move).toBeNull();
  });

  it('still answers when the move history is corrupt', async () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await runWorker({ id: 2, startFen: start, moves: ['e2e5'], level: 'easy' });
    expect(response.id).toBe(2);
    expect(response.move).not.toBeNull();
  });
});
