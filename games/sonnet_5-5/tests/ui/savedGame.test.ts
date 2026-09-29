import { describe, expect, it } from 'vitest';
import type { EngineResponse, Level } from '../../src/engine/engineTypes';
import { START_FEN } from '../../src/engine/position';
import { BLACK, WHITE } from '../../src/engine/types';
import { GameController, type EnginePort } from '../../src/ui/controller';

const idleEngine: EnginePort = {
  requestMove: (_fen: string, _moves: string[], _level: Level): Promise<EngineResponse> => new Promise(() => undefined),
  cancel: () => undefined,
};

const newController = (): GameController => new GameController(idleEngine, { minDelayMs: 0 });

const SCHOLARS_MATE = ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7'];

describe('GameController saved game', () => {
  it('has nothing to export before a game starts', () => {
    expect(newController().exportSavedGame()).toBeNull();
  });

  it('round-trips a mid-game position through export and import', () => {
    const source = newController();
    source.importSavedGame({ startFen: START_FEN, playerColor: WHITE, level: 'hard', moves: ['e2e4', 'e7e5'], resigned: false });
    const saved = source.exportSavedGame();
    expect(saved).toEqual({
      startFen: START_FEN,
      playerColor: WHITE,
      level: 'hard',
      moves: ['e2e4', 'e7e5'],
      resigned: false,
    });

    const target = newController();
    target.importSavedGame(JSON.parse(JSON.stringify(saved)));
    expect(target.getSnapshot().sanHistory).toEqual(['e4', 'e5']);
    expect(target.getSnapshot().level).toBe('hard');
    expect(target.getSnapshot().active).toBe(true);
  });

  it('summarises an unfinished game as * with the half-move count', () => {
    const controller = newController();
    controller.importSavedGame({ startFen: START_FEN, playerColor: WHITE, level: 'easy', moves: ['e2e4', 'e7e5'], resigned: false });
    expect(controller.summarizeSavedGame()).toEqual({ result: '*', moveCount: 2 });
  });

  it('summarises checkmate by the winner colour', () => {
    const controller = newController();
    controller.importSavedGame({ startFen: START_FEN, playerColor: WHITE, level: 'easy', moves: SCHOLARS_MATE, resigned: false });
    expect(controller.summarizeSavedGame()).toEqual({ result: '1-0', moveCount: 7 });
  });

  it('summarises a resignation as a win for the opponent and persists it', () => {
    const controller = newController();
    controller.importSavedGame({ startFen: START_FEN, playerColor: WHITE, level: 'easy', moves: ['e2e4', 'e7e5'], resigned: true });
    expect(controller.summarizeSavedGame()).toEqual({ result: '0-1', moveCount: 2 });
    expect(controller.exportSavedGame()?.resigned).toBe(true);
  });

  it('summarises a draw as 1/2-1/2', () => {
    const controller = newController();
    controller.importSavedGame({
      startFen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1',
      playerColor: BLACK,
      level: 'easy',
      moves: [],
      resigned: false,
    });
    expect(controller.summarizeSavedGame()).toEqual({ result: '1/2-1/2', moveCount: 0 });
  });

  it.each([
    ['a non-object', 'junk'],
    ['null', null],
    ['an unknown level', { startFen: START_FEN, playerColor: WHITE, level: 'godlike', moves: [], resigned: false }],
    ['a bad colour', { startFen: START_FEN, playerColor: 2, level: 'easy', moves: [], resigned: false }],
    ['non-string moves', { startFen: START_FEN, playerColor: WHITE, level: 'easy', moves: [1], resigned: false }],
    ['an illegal move', { startFen: START_FEN, playerColor: WHITE, level: 'easy', moves: ['e2e5'], resigned: false }],
    ['a bad FEN', { startFen: 'nonsense', playerColor: WHITE, level: 'easy', moves: [], resigned: false }],
    ['a non-boolean resigned', { startFen: START_FEN, playerColor: WHITE, level: 'easy', moves: [], resigned: 'no' }],
  ])('rejects %s and leaves the current game untouched', (_name, bad) => {
    const controller = newController();
    controller.importSavedGame({ startFen: START_FEN, playerColor: WHITE, level: 'easy', moves: ['e2e4', 'e7e5'], resigned: false });
    expect(() => controller.importSavedGame(bad)).toThrow(Error);
    expect(controller.getSnapshot().sanHistory).toEqual(['e4', 'e5']);
  });
});
