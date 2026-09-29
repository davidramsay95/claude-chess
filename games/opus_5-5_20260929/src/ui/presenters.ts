import type { GameStatus } from "../core/game";

export type Side = "white" | "black";

export interface BoardRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ScoresheetCell {
  san: string;
  /** Number of half-moves played once this move is on the board. */
  ply: number;
}

export interface ScoresheetRow {
  number: number;
  white: ScoresheetCell | null;
  black: ScoresheetCell | null;
}

/** 0x88 square shown at display cell `index` (0 is top-left, row-major) for the given orientation. */
export const displaySquare = (index: number, orientation: Side): number => {
  const row = index >> 3;
  const column = index & 7;
  return orientation === "white" ? (7 - row) * 16 + column : row * 16 + (7 - column);
};

/** 0x88 square under a viewport point, or -1 when the point is off the board. */
export const squareAtPoint = (x: number, y: number, rect: BoardRect, orientation: Side): number => {
  const column = Math.floor(((x - rect.left) / rect.width) * 8);
  const row = Math.floor(((y - rect.top) / rect.height) * 8);
  if (column < 0 || column > 7 || row < 0 || row > 7) return -1;
  return displaySquare(row * 8 + column, orientation);
};

/** Groups SAN moves into numbered scoresheet rows, leaving the white cell empty when black moved first. */
export const scoresheetRows = (sans: string[], firstMoveNumber: number, firstMover: Side): ScoresheetRow[] => {
  const rows: ScoresheetRow[] = [];
  const offset = firstMover === "black" ? 1 : 0;
  sans.forEach((san, index) => {
    const slot = index + offset;
    const rowIndex = slot >> 1;
    if (!rows[rowIndex]) rows[rowIndex] = { number: firstMoveNumber + rowIndex, white: null, black: null };
    const cell: ScoresheetCell = { san, ply: index + 1 };
    if (slot % 2 === 0) rows[rowIndex].white = cell;
    else rows[rowIndex].black = cell;
  });
  return rows;
};

const DRAW_REASONS: Record<string, string> = {
  stalemate: "Draw by stalemate",
  threefold: "Draw by threefold repetition",
  "fifty-move": "Draw by the fifty-move rule",
  insufficient: "Draw by insufficient material",
};

/** One-line status for the panel, written from the human player's point of view. */
export const describeStatus = (status: GameStatus, sideToMove: Side, playerColor: Side): string => {
  if (status.result === "*") {
    const turn = sideToMove === playerColor ? "Your move" : "Engine is thinking";
    return status.inCheck ? `Check. ${turn}` : turn;
  }
  if (status.result === "1/2-1/2") return DRAW_REASONS[status.reason ?? ""] ?? "Draw";
  const winner: Side = status.result === "1-0" ? "white" : "black";
  const outcome = winner === playerColor ? "You win" : "The engine wins";
  if (status.reason === "resignation") return winner === playerColor ? "The engine resigned. You win" : `You resigned. ${outcome}`;
  return `Checkmate. ${outcome}`;
};
