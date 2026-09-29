import { BLACK, type Color, makeSquare, squareFile, squareRank } from '../engine/types';

export interface DisplayPosition {
  row: number;
  col: number;
}

export interface BoardRect {
  left: number;
  top: number;
  size: number;
}

/** Converts a row-major display index (0 = top-left) to a board square for the given bottom color. */
export const displayIndexToSquare = (index: number, orientation: Color): number => {
  const row = index >> 3;
  const col = index & 7;
  return orientation === BLACK ? makeSquare(7 - col, row) : makeSquare(col, 7 - row);
};

export const displayPosition = (square: number, orientation: Color): DisplayPosition => {
  const file = squareFile(square);
  const rank = squareRank(square);
  return orientation === BLACK ? { row: rank, col: 7 - file } : { row: 7 - rank, col: file };
};

export const squareToDisplayIndex = (square: number, orientation: Color): number => {
  const { row, col } = displayPosition(square, orientation);
  return row * 8 + col;
};

/** File letter to draw on a square, or null unless it sits on the bottom edge. */
export const fileLabelFor = (square: number, orientation: Color): string | null =>
  displayPosition(square, orientation).row === 7 ? 'abcdefgh'[squareFile(square)] : null;

/** Rank digit to draw on a square, or null unless it sits on the left edge. */
export const rankLabelFor = (square: number, orientation: Color): string | null =>
  displayPosition(square, orientation).col === 0 ? String(squareRank(square) + 1) : null;

/** Maps viewport coordinates to a square, or null when the point is outside the board. */
export const squareFromPoint = (x: number, y: number, rect: BoardRect, orientation: Color): number | null => {
  const col = Math.floor(((x - rect.left) / rect.size) * 8);
  const row = Math.floor(((y - rect.top) / rect.size) * 8);
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  return displayIndexToSquare(row * 8 + col, orientation);
};
