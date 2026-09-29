import { describe, expect, it } from 'vitest';
import { BLACK, WHITE, parseSquare } from '../../src/engine/types';
import {
  displayIndexToSquare,
  displayPosition,
  fileLabelFor,
  rankLabelFor,
  squareFromPoint,
  squareToDisplayIndex,
} from '../../src/ui/geometry';

describe('board geometry', () => {
  it('puts a8 top-left and h1 bottom-right for white', () => {
    expect(displayIndexToSquare(0, WHITE)).toBe(parseSquare('a8'));
    expect(displayIndexToSquare(63, WHITE)).toBe(parseSquare('h1'));
  });

  it('puts h1 top-left and a8 bottom-right for black', () => {
    expect(displayIndexToSquare(0, BLACK)).toBe(parseSquare('h1'));
    expect(displayIndexToSquare(63, BLACK)).toBe(parseSquare('a8'));
  });

  it('round-trips every square in both orientations', () => {
    for (const orientation of [WHITE, BLACK] as const) {
      for (let sq = 0; sq < 64; sq++) {
        expect(displayIndexToSquare(squareToDisplayIndex(sq, orientation), orientation)).toBe(sq);
      }
    }
  });

  it('reports row and column for a square', () => {
    expect(displayPosition(parseSquare('e2'), WHITE)).toEqual({ row: 6, col: 4 });
    expect(displayPosition(parseSquare('e2'), BLACK)).toEqual({ row: 1, col: 3 });
  });

  it('labels files on the bottom row and ranks on the left column only', () => {
    expect(fileLabelFor(parseSquare('a1'), WHITE)).toBe('a');
    expect(fileLabelFor(parseSquare('a2'), WHITE)).toBeNull();
    expect(rankLabelFor(parseSquare('a3'), WHITE)).toBe('3');
    expect(rankLabelFor(parseSquare('b3'), WHITE)).toBeNull();
    expect(fileLabelFor(parseSquare('h8'), BLACK)).toBe('h');
    expect(rankLabelFor(parseSquare('h8'), BLACK)).toBe('8');
  });

  it('maps a point inside the board to a square and rejects outside points', () => {
    const rect = { left: 100, top: 50, size: 400 };
    expect(squareFromPoint(105, 55, rect, WHITE)).toBe(parseSquare('a8'));
    expect(squareFromPoint(495, 445, rect, WHITE)).toBe(parseSquare('h1'));
    expect(squareFromPoint(105, 55, rect, BLACK)).toBe(parseSquare('h1'));
    expect(squareFromPoint(99, 55, rect, WHITE)).toBeNull();
    expect(squareFromPoint(500, 60, rect, WHITE)).toBeNull();
  });
});
