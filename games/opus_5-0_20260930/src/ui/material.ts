import { KING, PAWN, Position, WHITE } from "../engine/position.ts";

const VALUE = [0, 1, 3, 3, 5, 9, 0];

export interface MaterialSummary {
  /** Piece types Black has lost, most valuable first. */
  takenByWhite: number[];
  takenByBlack: number[];
  /** Positive when White is ahead, in pawns. */
  advantage: number;
}

function census(position: Position): number[][] {
  const counts = [new Array<number>(7).fill(0), new Array<number>(7).fill(0)];
  for (let square = 0; square < 128; square++) {
    if (square & 0x88) continue;
    const piece = position.pieceAt(square);
    if (!piece) continue;
    counts[(piece >> 3) & 1][piece & 7]++;
  }
  return counts;
}

/** Which pieces have left the board since the starting position, and for whom. */
export function materialSummary(start: Position, current: Position): MaterialSummary {
  const before = census(start);
  const after = census(current);
  const takenByWhite: number[] = [];
  const takenByBlack: number[] = [];
  let advantage = 0;

  for (let type = PAWN; type < KING; type++) {
    for (let missing = 0; missing < before[1][type] - after[1][type]; missing++) {
      takenByWhite.push(type);
    }
    for (let missing = 0; missing < before[WHITE][type] - after[WHITE][type]; missing++) {
      takenByBlack.push(type);
    }
    advantage += (after[WHITE][type] - after[1][type]) * VALUE[type];
  }
  takenByWhite.sort((a, b) => b - a);
  takenByBlack.sort((a, b) => b - a);
  return { takenByWhite, takenByBlack, advantage };
}
