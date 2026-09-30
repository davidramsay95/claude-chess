import { getLegalMoves, tryApplyMove } from "./moves";
import type { GameState } from "./types";

/**
 * Counts the number of leaf nodes in the legal-move tree rooted at `state`,
 * `depth` plies deep. Standard perft testing tool for validating a move
 * generator against known-correct node counts.
 */
export function perft(state: GameState, depth: number): number {
  if (depth === 0) return 1;

  const moves = getLegalMoves(state);
  if (depth === 1) return moves.length;

  let nodes = 0;
  for (const move of moves) {
    const result = tryApplyMove(state, move);
    if (!result) {
      throw new Error(`perft: generated move ${move.from}${move.to} was not applicable`);
    }
    nodes += perft(result.state, depth - 1);
  }
  return nodes;
}
