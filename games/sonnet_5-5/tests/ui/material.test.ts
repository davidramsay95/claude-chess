import { describe, expect, it } from 'vitest';
import { Position } from '../../src/engine/position';
import { BISHOP, KNIGHT, PAWN, QUEEN, ROOK } from '../../src/engine/types';
import { computeMaterial, formatAdvantage } from '../../src/ui/material';

describe('material', () => {
  it('reports nothing captured and even balance at the start', () => {
    const m = computeMaterial(Position.startPosition().board);
    expect(m.capturedByWhite).toEqual([]);
    expect(m.capturedByBlack).toEqual([]);
    expect(m.balance).toBe(0);
  });

  it('lists captured pieces most valuable first and computes the balance', () => {
    const pos = Position.fromFen('r1b1kbn1/pppppppp/8/8/8/8/PPPPPP2/R1BQKB1R w KQkq - 0 1');
    const m = computeMaterial(pos.board);
    expect(m.capturedByWhite).toEqual([QUEEN, ROOK, KNIGHT]);
    expect(m.capturedByBlack).toEqual([KNIGHT, KNIGHT, PAWN, PAWN]);
    expect(m.balance).toBe(9);
  });

  it('computes exact captured lists for a simple position', () => {
    const pos = Position.fromFen('4k3/8/8/8/8/8/PP6/R3K3 w - - 0 1');
    const m = computeMaterial(pos.board);
    expect(m.capturedByWhite).toEqual([QUEEN, ROOK, ROOK, BISHOP, BISHOP, KNIGHT, KNIGHT, PAWN, PAWN, PAWN, PAWN, PAWN, PAWN, PAWN, PAWN]);
    expect(m.capturedByBlack).toEqual([QUEEN, ROOK, BISHOP, BISHOP, KNIGHT, KNIGHT, PAWN, PAWN, PAWN, PAWN, PAWN, PAWN]);
    expect(m.balance).toBe(7);
  });

  it('does not count promoted extras as negative captures', () => {
    const pos = Position.fromFen('4k3/8/8/8/8/8/8/QQQQK3 w - - 0 1');
    const m = computeMaterial(pos.board);
    expect(m.capturedByBlack.filter((k) => k === QUEEN)).toEqual([]);
    expect(m.balance).toBeGreaterThan(0);
  });

  it('formats the advantage per side', () => {
    expect(formatAdvantage(3, 0)).toBe('+3');
    expect(formatAdvantage(3, 1)).toBeNull();
    expect(formatAdvantage(-3, 1)).toBe('+3');
    expect(formatAdvantage(0, 0)).toBeNull();
  });
});
