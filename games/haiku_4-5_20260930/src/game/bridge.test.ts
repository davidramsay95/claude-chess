import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameManager } from './gameManager';
import { BridgeHandler } from './bridge';

describe('BridgeHandler - Protocol', () => {
  it('should handle game state import', () => {
    const gameManager = new GameManager();
    gameManager.startNewGame('white', 'medium');

    const state = gameManager.exportGameState();
    expect(state.version).toBe(1);

    const gameManager2 = new GameManager();
    const success = gameManager2.importGameState(state);
    expect(success).toBe(true);
    expect(gameManager2.getPlayerColor()).toBe('white');
  });

  it('should create bridge handler', () => {
    const gameManager = new GameManager();
    const bridge = new BridgeHandler(gameManager);
    expect(bridge).toBeDefined();
  });
});
