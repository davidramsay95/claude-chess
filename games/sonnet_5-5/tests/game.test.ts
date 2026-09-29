import { describe, expect, it } from 'vitest';
import { Game } from '../src/engine/game';
import { parseSquare } from '../src/engine/types';

const playUci = (game: Game, moves: string[]): void => {
  for (const uci of moves) {
    const move = game.parseUci(uci);
    if (move === undefined) throw new Error(`Illegal move in test: ${uci}`);
    game.play(move);
  }
};

describe('Game status', () => {
  it('starts ongoing with 20 legal moves', () => {
    const game = new Game();
    expect(game.status().state).toBe('ongoing');
    expect(game.legalMoves()).toHaveLength(20);
  });

  it('detects fool\'s mate', () => {
    const game = new Game();
    playUci(game, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(game.status()).toMatchObject({ state: 'checkmate', winner: 1, check: true });
    expect(game.sanHistory.at(-1)).toBe('Qh4#');
  });

  it('detects stalemate', () => {
    const game = Game.fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(game.status()).toMatchObject({ state: 'draw', reason: 'stalemate' });
  });

  it('detects insufficient material', () => {
    expect(Game.fromFen('8/8/4k3/8/8/3K4/8/8 w - - 0 1').status().reason).toBe('insufficient-material');
    expect(Game.fromFen('8/8/4k3/8/8/3KB3/8/8 w - - 0 1').status().reason).toBe('insufficient-material');
    expect(Game.fromFen('8/8/4k3/8/8/3KP3/8/8 w - - 0 1').status().state).toBe('ongoing');
  });

  it('detects the fifty-move rule', () => {
    const game = Game.fromFen('8/8/4k3/8/8/3K4/R7/8 w - - 100 80');
    expect(game.status()).toMatchObject({ state: 'draw', reason: 'fifty-move' });
  });

  it('detects threefold repetition', () => {
    const game = new Game();
    playUci(game, ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']);
    expect(game.status()).toMatchObject({ state: 'draw', reason: 'threefold-repetition' });
  });
});

describe('Game moves', () => {
  it('produces promotion moves for each piece', () => {
    const game = Game.fromFen('8/P6k/8/8/8/8/8/K7 w - - 0 1');
    const promos = game.legalMovesFrom(parseSquare('a7'));
    expect(promos).toHaveLength(4);
    expect(game.parseUci('a7a8n')).toBeDefined();
  });

  it('rejects illegal moves', () => {
    const game = new Game();
    expect(game.parseUci('e2e5')).toBeUndefined();
    expect(game.parseUci('e7e5')).toBeUndefined();
  });

  it('handles en passant', () => {
    const game = new Game();
    playUci(game, ['e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6']);
    expect(game.position.board[parseSquare('d5')]).toBe(0);
    expect(game.sanHistory.at(-1)).toBe('exd6');
  });

  it('generates SAN with disambiguation, castling, and promotion', () => {
    const game = Game.fromFen('r3k2r/1P6/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(game.toSan(game.parseUci('e1g1')!)).toBe('O-O');
    expect(game.toSan(game.parseUci('e1c1')!)).toBe('O-O-O');
    expect(game.toSan(game.parseUci('b7a8q')!)).toBe('bxa8=Q+');
    expect(game.toSan(game.parseUci('a1a8')!)).toBe('Rxa8+');
    const knights = Game.fromFen('4k3/8/8/8/8/2N3N1/8/4K3 w - - 0 1');
    expect(knights.toSan(knights.parseUci('c3e4')!)).toBe('Nce4');
  });

  it('undoes moves', () => {
    const game = new Game();
    const fen = game.position.toFen();
    playUci(game, ['e2e4', 'e7e5']);
    expect(game.undo()).toBe(true);
    expect(game.undo()).toBe(true);
    expect(game.undo()).toBe(false);
    expect(game.position.toFen()).toBe(fen);
    expect(game.sanHistory).toHaveLength(0);
  });

  it('cannot castle through or out of check', () => {
    const game = Game.fromFen('4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1');
    expect(game.parseUci('e1g1')).toBeUndefined();
    const through = Game.fromFen('4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1');
    expect(through.parseUci('e1g1')).toBeUndefined();
    expect(through.parseUci('e1c1')).toBeDefined();
  });
});
