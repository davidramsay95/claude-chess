import type { Game } from "../engine/game.ts";

export interface MoveCell {
  san: string;
  /** Index into `game.moves`, for jumping the board to that point. */
  index: number;
}

export interface MoveListRow {
  number: number;
  white: MoveCell | null;
  black: MoveCell | null;
}

/**
 * Groups the half-move list into numbered rows. A game that starts with Black
 * to move gets an empty white cell in its first row, the way a printed score
 * sheet writes `1... c5`.
 */
export function pairMoves(game: Game): MoveListRow[] {
  const rows: MoveListRow[] = [];
  game.moves.forEach((record, index) => {
    const number = game.moveNumberAt(index);
    const isWhiteMove = game.isWhiteMove(index);
    let row = rows[rows.length - 1];
    if (!row || row.number !== number) {
      row = { number, white: null, black: null };
      rows.push(row);
    }
    const cell: MoveCell = { san: record.san, index };
    if (isWhiteMove) row.white = cell;
    else row.black = cell;
  });
  return rows;
}
