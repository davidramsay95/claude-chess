import type { Position } from "./position";

/** Count leaf nodes of the legal move tree; the standard move generator check. */
export const perft = (pos: Position, depth: number): number => {
  if (depth === 0) return 1;
  const moves = pos.legalMoves();
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (const move of moves) {
    const undo = pos.makeMove(move);
    nodes += perft(pos, depth - 1);
    pos.unmakeMove(move, undo);
  }
  return nodes;
};
