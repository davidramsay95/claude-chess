import type { Position } from "./position";

/** Counts leaf nodes of the legal move tree; the standard correctness check for move generation. */
export const perft = (pos: Position, depth: number): number => {
  if (depth === 0) return 1;
  const moves = pos.legalMoves();
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (const move of moves) {
    pos.makeMove(move);
    nodes += perft(pos, depth - 1);
    pos.undoMove();
  }
  return nodes;
};
