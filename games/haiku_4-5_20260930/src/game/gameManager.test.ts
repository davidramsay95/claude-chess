import { describe, it, expect } from 'vitest';
import { GameManager } from './gameManager';

describe('GameManager - Core Functionality', () => {
  it('should start a new game', () => {
    const manager = new GameManager();
    manager.startNewGame('white', 'medium');

    expect(manager.getPlayerColor()).toBe('white');
    expect(manager.getDifficulty()).toBe('medium');
    expect(manager.isPlayerTurn()).toBe(true);
  });

  it('should export and import game state', () => {
    const manager = new GameManager();
    manager.startNewGame('white', 'medium');

    const state = manager.exportGameState();
    expect(state.version).toBe(1);
    expect(state.playerColor).toBe('white');

    const manager2 = new GameManager();
    const success = manager2.importGameState(state);
    expect(success).toBe(true);
  });

  it('should reject invalid state versions', () => {
    const manager = new GameManager();

    const invalidState = {
      version: 2 as any,
      startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      playerColor: 'white' as const,
      difficulty: 'medium' as const,
      moves: [],
      resigned: false,
    };

    const success = manager.importGameState(invalidState);
    expect(success).toBe(false);
  });

  it('should track resignation', () => {
    const manager = new GameManager();
    manager.startNewGame('white', 'medium');
    manager.resign();

    expect(manager.isGameEnded()).toBe(true);
    expect(manager.exportGameState().resigned).toBe(true);
  });
});
