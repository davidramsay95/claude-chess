import { describe, expect, it } from 'vitest';
import { BLACK, WHITE } from '../../src/engine/types';
import { describeResult, resultFromStatus } from '../../src/ui/gameResult';

describe('resultFromStatus', () => {
  it('returns null while the game is ongoing', () => {
    expect(resultFromStatus({ state: 'ongoing', check: false })).toBeNull();
  });

  it('maps checkmate and draws', () => {
    expect(resultFromStatus({ state: 'checkmate', winner: WHITE, check: true })).toEqual({ kind: 'checkmate', winner: WHITE });
    expect(resultFromStatus({ state: 'draw', reason: 'stalemate', check: false })).toEqual({ kind: 'draw', reason: 'stalemate' });
  });
});

describe('describeResult', () => {
  it('says the player won by checkmate', () => {
    expect(describeResult({ kind: 'checkmate', winner: WHITE }, WHITE)).toEqual({
      title: 'You win',
      detail: 'Checkmate',
      tone: 'win',
    });
  });

  it('says the player lost by checkmate', () => {
    expect(describeResult({ kind: 'checkmate', winner: WHITE }, BLACK)).toEqual({
      title: 'You lose',
      detail: 'Checkmate',
      tone: 'loss',
    });
  });

  it('describes each draw reason', () => {
    const detail = (reason: 'stalemate' | 'threefold-repetition' | 'fifty-move' | 'insufficient-material' | 'agreement'): string =>
      describeResult({ kind: 'draw', reason }, WHITE).detail;
    expect(detail('stalemate')).toBe('Stalemate');
    expect(detail('threefold-repetition')).toBe('Threefold repetition');
    expect(detail('fifty-move')).toBe('Fifty-move rule');
    expect(detail('insufficient-material')).toBe('Insufficient material');
    expect(describeResult({ kind: 'draw', reason: 'stalemate' }, WHITE).title).toBe('Draw');
    expect(describeResult({ kind: 'draw', reason: 'stalemate' }, WHITE).tone).toBe('draw');
  });

  it('describes resignation', () => {
    expect(describeResult({ kind: 'resignation', winner: BLACK }, WHITE)).toEqual({
      title: 'You lose',
      detail: 'You resigned',
      tone: 'loss',
    });
  });
});
