import type { Side } from "@/chess/game";

const FILES = "abcdefgh";

export interface Point {
  x: number;
  y: number;
}

export interface BoardRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface EdgeLabels {
  rank?: string;
  file?: string;
}

const fileIndex = (square: string): number => FILES.indexOf(square[0]);
const rankIndex = (square: string): number => Number(square[1]) - 1;

/** Screen column (0 = left) and row (0 = top) of a square for the given viewing side. */
const screenCell = (square: string, orientation: Side): Point =>
  orientation === "w"
    ? { x: fileIndex(square), y: 7 - rankIndex(square) }
    : { x: 7 - fileIndex(square), y: rankIndex(square) };

const squareAtCell = (column: number, row: number, orientation: Side): string =>
  orientation === "w" ? `${FILES[column]}${8 - row}` : `${FILES[7 - column]}${row + 1}`;

/** All 64 squares in reading order (top-left first) as seen by the given side. */
export const displaySquares = (orientation: Side): string[] =>
  Array.from({ length: 64 }, (_, index) => squareAtCell(index % 8, Math.floor(index / 8), orientation));

export const isLightSquare = (square: string): boolean => (fileIndex(square) + rankIndex(square)) % 2 === 1;

/** Coordinates are printed only on the left column (ranks) and bottom row (files), like a real board. */
export const edgeLabels = (square: string, orientation: Side): EdgeLabels => {
  const cell = screenCell(square, orientation);
  return {
    ...(cell.x === 0 ? { rank: square[1] } : {}),
    ...(cell.y === 7 ? { file: square[0] } : {}),
  };
};

/** Finds the square under a pointer position, or null when the pointer is off the board. */
export const squareAtPoint = (point: Point, rect: BoardRect, orientation: Side): string | null => {
  const column = Math.floor(((point.x - rect.left) / rect.width) * 8);
  const row = Math.floor(((point.y - rect.top) / rect.height) * 8);
  if (column < 0 || column > 7 || row < 0 || row > 7) return null;
  return squareAtCell(column, row, orientation);
};

/** On-screen offset from one square to another, in square widths, so moves can be animated. */
export const squareDistance = (from: string, to: string, orientation: Side): Point => {
  const start = screenCell(from, orientation);
  const end = screenCell(to, orientation);
  return { x: end.x - start.x, y: end.y - start.y };
};
