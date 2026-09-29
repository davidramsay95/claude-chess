import type { BoardPiece, MoveRecord, PieceSymbol } from "@/chess/game";

const PIECE_VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export interface MaterialBalance {
  capturedByWhite: PieceSymbol[];
  capturedByBlack: PieceSymbol[];
  /** Material lead in pawns from White's point of view; negative when Black is ahead. */
  advantage: number;
}

const byValueDescending = (a: PieceSymbol, b: PieceSymbol): number => PIECE_VALUES[b] - PIECE_VALUES[a];

const capturesBy = (history: readonly MoveRecord[], color: "w" | "b"): PieceSymbol[] =>
  history.flatMap((move) => (move.color === color && move.captured ? [move.captured] : [])).sort(byValueDescending);

/**
 * Summarises captured pieces and the material lead. The lead is counted from the pieces on the
 * board rather than the captures, so promotions are reflected too.
 */
export const materialBalance = (pieces: readonly BoardPiece[], history: readonly MoveRecord[]): MaterialBalance => ({
  capturedByWhite: capturesBy(history, "w"),
  capturedByBlack: capturesBy(history, "b"),
  advantage: pieces.reduce((sum, piece) => sum + (piece.color === "w" ? 1 : -1) * PIECE_VALUES[piece.type], 0),
});
