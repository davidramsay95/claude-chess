import { describe, expect, it } from 'vitest';
import { BLACK, WHITE, parseSquare, KNIGHT } from '../../src/engine/types';
import type { EngineResponse, Level } from '../../src/engine/engineTypes';
import { GameController, type EnginePort } from '../../src/ui/controller';

interface Deferred {
  moves: string[];
  level: Level;
  resolve: (response: EngineResponse) => void;
  reject: (error: Error) => void;
}

class FakeEngine implements EnginePort {
  requests: Deferred[] = [];
  cancelCount = 0;

  requestMove(_startFen: string, moves: string[], level: Level): Promise<EngineResponse> {
    return new Promise<EngineResponse>((resolve, reject) => {
      this.requests.push({ moves, level, resolve: (r) => resolve(r), reject });
    });
  }

  cancel(): void {
    this.cancelCount++;
    for (const request of this.requests) request.reject(new Error('cancelled'));
    this.requests = [];
  }

  reply(move: string | null): void {
    const request = this.requests.shift();
    if (!request) throw new Error('no pending request');
    request.resolve({ id: 1, move });
  }
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

const setup = (playerColor: 0 | 1 = WHITE, startFen?: string): { controller: GameController; engine: FakeEngine } => {
  const engine = new FakeEngine();
  const controller = new GameController(engine, { minDelayMs: 0 });
  controller.start({ playerColor, level: 'medium', startFen });
  return { controller, engine };
};

const sq = parseSquare;

describe('GameController', () => {
  it('lets a white player select a piece and shows legal targets', () => {
    const { controller } = setup();
    controller.select(sq('g1'));
    const snap = controller.getSnapshot();
    expect(snap.selected).toBe(sq('g1'));
    expect(snap.targets.map((t) => t.square).sort()).toEqual([sq('f3'), sq('h3')].sort());
  });

  it('ignores selecting the opponent piece', () => {
    const { controller } = setup();
    controller.select(sq('g8'));
    expect(controller.getSnapshot().selected).toBeNull();
  });

  it('plays a click move, then requests and applies the computer reply', async () => {
    const { controller, engine } = setup();
    controller.select(sq('e2'));
    controller.tap(sq('e4'));
    expect(controller.getSnapshot().thinking).toBe(true);
    expect(engine.requests[0].moves).toEqual(['e2e4']);
    engine.reply('e7e5');
    await flush();
    const snap = controller.getSnapshot();
    expect(snap.thinking).toBe(false);
    expect(snap.sanHistory).toEqual(['e4', 'e5']);
    expect(snap.lastMove).toEqual({ from: sq('e7'), to: sq('e5') });
  });

  it('blocks player input while the computer is thinking', () => {
    const { controller } = setup();
    controller.select(sq('e2'));
    controller.tap(sq('e4'));
    controller.select(sq('d2'));
    controller.drop(sq('d2'), sq('d4'));
    expect(controller.getSnapshot().sanHistory).toEqual(['e4']);
    expect(controller.getSnapshot().selected).toBeNull();
  });

  it('asks the computer to open when the player is black', () => {
    const { controller, engine } = setup(BLACK);
    expect(controller.getSnapshot().thinking).toBe(true);
    expect(engine.requests[0].moves).toEqual([]);
  });

  it('never applies a response that was cancelled by a new game', async () => {
    const { controller, engine } = setup(BLACK);
    const stale = engine.requests[0];
    controller.start({ playerColor: WHITE, level: 'easy' });
    expect(engine.cancelCount).toBeGreaterThan(0);
    stale.resolve({ id: 1, move: 'e2e4' });
    await flush();
    const snap = controller.getSnapshot();
    expect(snap.sanHistory).toEqual([]);
    expect(snap.thinking).toBe(false);
  });

  it('ignores a resolved response after resign', async () => {
    const { controller, engine } = setup();
    controller.select(sq('e2'));
    controller.tap(sq('e4'));
    const pending = engine.requests[0];
    controller.resign();
    pending.resolve({ id: 1, move: 'e7e5' });
    await flush();
    const snap = controller.getSnapshot();
    expect(snap.sanHistory).toEqual(['e4']);
    expect(snap.result).toEqual({ kind: 'resignation', winner: BLACK });
  });

  it('cannot undo while thinking and undoes both plies otherwise', async () => {
    const { controller, engine } = setup();
    expect(controller.getSnapshot().canUndo).toBe(false);
    controller.select(sq('e2'));
    controller.tap(sq('e4'));
    expect(controller.getSnapshot().canUndo).toBe(false);
    engine.reply('e7e5');
    await flush();
    expect(controller.getSnapshot().canUndo).toBe(true);
    controller.undo();
    const snap = controller.getSnapshot();
    expect(snap.sanHistory).toEqual([]);
    expect(snap.canUndo).toBe(false);
    expect(snap.turn).toBe(WHITE);
  });

  it('cannot undo the computer opening when the player is black', async () => {
    const { controller, engine } = setup(BLACK);
    engine.reply('e2e4');
    await flush();
    expect(controller.getSnapshot().canUndo).toBe(false);
  });

  it('asks for promotion and applies the chosen piece', () => {
    const { controller } = setup(WHITE, '4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    controller.select(sq('a7'));
    controller.tap(sq('a8'));
    expect(controller.getSnapshot().pendingPromotion).toEqual({ from: sq('a7'), to: sq('a8') });
    controller.choosePromotion(KNIGHT);
    expect(controller.getSnapshot().sanHistory[0].startsWith('a8=N')).toBe(true);
    expect(controller.getSnapshot().pendingPromotion).toBeNull();
  });

  it('cancels a pending promotion', () => {
    const { controller } = setup(WHITE, '4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    controller.select(sq('a7'));
    controller.tap(sq('a8'));
    controller.choosePromotion(null);
    const snap = controller.getSnapshot();
    expect(snap.pendingPromotion).toBeNull();
    expect(snap.sanHistory).toEqual([]);
  });

  it('detects checkmate and stops requesting moves', async () => {
    const { controller, engine } = setup(BLACK);
    engine.reply('f2f3');
    await flush();
    controller.select(sq('e7'));
    controller.tap(sq('e5'));
    engine.reply('g2g4');
    await flush();
    controller.select(sq('d8'));
    controller.tap(sq('h4'));
    const snap = controller.getSnapshot();
    expect(snap.result).toEqual({ kind: 'checkmate', winner: BLACK });
    expect(snap.thinking).toBe(false);
    expect(engine.requests).toHaveLength(0);
  });

  it('surfaces engine errors and retries', async () => {
    const { controller, engine } = setup(BLACK);
    engine.requests.shift()?.reject(new Error('boom'));
    await flush();
    expect(controller.getSnapshot().error).toBe('boom');
    expect(controller.getSnapshot().thinking).toBe(false);
    controller.retry();
    expect(controller.getSnapshot().thinking).toBe(true);
    expect(controller.getSnapshot().error).toBeNull();
    engine.reply('e2e4');
    await flush();
    expect(controller.getSnapshot().sanHistory).toEqual(['e4']);
  });

  it('treats a drop on the origin square as a no-op that keeps the selection', () => {
    const { controller } = setup();
    controller.select(sq('e2'));
    controller.drop(sq('e2'), sq('e2'));
    expect(controller.getSnapshot().selected).toBe(sq('e2'));
    expect(controller.getSnapshot().sanHistory).toEqual([]);
  });
});
