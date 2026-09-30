import { fileOf, rankOf } from "./board";
import { getLegalMoves, isInCheckAt } from "./moves";
import type { Color, GameState, GameStatus, Piece } from "./types";

export function isInCheck(state: GameState, color: Color): boolean {
  return isInCheckAt(state.board, color);
}

/**
 * FIDE-ish automatic-draw rule for insufficient material. We only call a
 * position dead-drawn for the combinations where checkmate is provably
 * impossible for either side:
 *   - K vs K
 *   - K+minor vs K (a single bishop or knight)
 *   - K+B vs K+B where both bishops are on the same square color
 * Two same-colored knights (K+N+N vs K) and opposite-colored bishops are
 * NOT included: mate is not reachable with mutual best play in the former,
 * but it isn't literally impossible (the opponent can help), so by common
 * over-the-board and engine convention we don't force an automatic draw for
 * either of those two cases and leave them to the fifty-move/repetition
 * rules instead.
 */
export function isInsufficientMaterial(state: GameState): boolean {
  const pieces: Piece[] = [];
  for (const piece of state.board) {
    if (piece && piece.type !== "k") pieces.push(piece);
  }

  if (pieces.length === 0) return true;

  if (pieces.length === 1) {
    return pieces[0].type === "n" || pieces[0].type === "b";
  }

  if (pieces.length === 2) {
    const [a, b] = pieces;
    if (a.type === "b" && b.type === "b" && a.color !== b.color) {
      const squareColorA = bishopSquareColor(state, a);
      const squareColorB = bishopSquareColor(state, b);
      return squareColorA === squareColorB;
    }
  }

  return false;
}

function bishopSquareColor(state: GameState, bishop: Piece): "light" | "dark" {
  const index = state.board.findIndex((p) => p === bishop);
  const file = fileOf(index);
  const rank = rankOf(index);
  return (file + rank) % 2 === 0 ? "dark" : "light";
}

function countOccurrences(history: readonly string[], key: string): number {
  let count = 0;
  for (const entry of history) {
    if (entry === key) count += 1;
  }
  return count;
}

export function isThreefoldRepetition(state: GameState): boolean {
  const currentKey = state.positionHistory[state.positionHistory.length - 1];
  return countOccurrences(state.positionHistory, currentKey) >= 3;
}

export function isFiftyMoveRule(state: GameState): boolean {
  return state.halfmoveClock >= 100;
}

export function getStatus(state: GameState): GameStatus {
  const legalMoves = getLegalMoves(state);

  if (legalMoves.length === 0) {
    return isInCheck(state, state.turn) ? "checkmate" : "stalemate";
  }

  if (isThreefoldRepetition(state)) return "draw-repetition";
  if (isFiftyMoveRule(state)) return "draw-fifty-move";
  if (isInsufficientMaterial(state)) return "draw-insufficient-material";

  return "active";
}

export function getWinner(state: GameState): Color | null {
  const status = getStatus(state);
  if (status !== "checkmate") return null;
  return state.turn === "white" ? "black" : "white";
}
