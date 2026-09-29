import { describe, expect, it } from 'vitest';
import { Game } from '../../src/engine/game';
import { parseSquare } from '../../src/engine/types';
import { moveAnimations } from '../../src/ui/moveAnimation';

const animationsFor = (fen: string, uci: string): { from: number; to: number }[] => {
  const game = Game.fromFen(fen);
  const move = game.parseUci(uci);
  if (move === undefined) throw new Error(`illegal ${uci}`);
  return moveAnimations(move);
};

describe('moveAnimations', () => {
  it('animates a single piece for a normal move', () => {
    expect(animationsFor('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4')).toEqual([
      { from: parseSquare('e2'), to: parseSquare('e4') },
    ]);
  });

  it('also animates the rook when castling kingside', () => {
    expect(animationsFor('4k3/8/8/8/8/8/8/4K2R w K - 0 1', 'e1g1')).toEqual([
      { from: parseSquare('e1'), to: parseSquare('g1') },
      { from: parseSquare('h1'), to: parseSquare('f1') },
    ]);
  });

  it('also animates the rook when castling queenside', () => {
    expect(animationsFor('r3k3/8/8/8/8/8/8/4K3 b q - 0 1', 'e8c8')).toEqual([
      { from: parseSquare('e8'), to: parseSquare('c8') },
      { from: parseSquare('a8'), to: parseSquare('d8') },
    ]);
  });
});
