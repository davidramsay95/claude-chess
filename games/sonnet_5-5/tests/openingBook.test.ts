import { describe, expect, it } from 'vitest';
import { Game } from '../src/engine/game';
import { BOOK_LINES, pickBookMove } from '../src/engine/openingBook';
import { playUci, seededRng } from './helpers';

describe('opening book', () => {
  it('contains only legal lines from the start position', () => {
    for (const line of BOOK_LINES) {
      const game = new Game();
      expect(() => playUci(game, line), line.join(' ')).not.toThrow();
    }
  });

  it('has a few dozen lines', () => {
    expect(BOOK_LINES.length).toBeGreaterThanOrEqual(30);
  });

  it('offers first moves for white', () => {
    const seen = new Set<string>();
    const rng = seededRng(1);
    for (let i = 0; i < 200; i++) {
      const move = pickBookMove([], 40, rng);
      if (move) seen.add(move);
    }
    expect(seen.has('e2e4')).toBe(true);
    expect(seen.has('d2d4')).toBe(true);
  });

  it('follows the history and stops at the ply limit', () => {
    const rng = seededRng(2);
    expect(pickBookMove(['e2e4', 'e7e5'], 40, rng)).toBe('g1f3');
    expect(pickBookMove(['e2e4', 'e7e5'], 2, rng)).toBeUndefined();
  });

  it('returns undefined once out of book', () => {
    expect(pickBookMove(['a2a3', 'a7a6'], 40, seededRng(3))).toBeUndefined();
  });
});
