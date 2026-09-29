import { describe, expect, it } from 'vitest';
import { pairMoves } from '../../src/ui/moveList';

describe('pairMoves', () => {
  it('returns no rows for an empty history', () => {
    expect(pairMoves([])).toEqual([]);
  });

  it('pairs plies into numbered rows with ply indices', () => {
    expect(pairMoves(['e4', 'e5', 'Nf3'])).toEqual([
      { number: 1, white: { san: 'e4', ply: 0 }, black: { san: 'e5', ply: 1 } },
      { number: 2, white: { san: 'Nf3', ply: 2 }, black: null },
    ]);
  });
});
