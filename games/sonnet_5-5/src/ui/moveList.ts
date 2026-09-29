export interface PlyEntry {
  san: string;
  /** Zero-based ply index in the game, used to highlight the current move. */
  ply: number;
}

export interface MoveRow {
  number: number;
  white: PlyEntry;
  black: PlyEntry | null;
}

/** Groups a SAN history into numbered White/Black rows. */
export const pairMoves = (sanHistory: readonly string[]): MoveRow[] => {
  const rows: MoveRow[] = [];
  for (let i = 0; i < sanHistory.length; i += 2) {
    rows.push({
      number: i / 2 + 1,
      white: { san: sanHistory[i], ply: i },
      black: i + 1 < sanHistory.length ? { san: sanHistory[i + 1], ply: i + 1 } : null,
    });
  }
  return rows;
};
