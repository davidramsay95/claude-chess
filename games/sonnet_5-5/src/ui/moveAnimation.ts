import { type Move, isCastle, makeSquare, moveFrom, moveTo, squareRank } from '../engine/types';

export interface MoveAnimation {
  from: number;
  to: number;
}

/** Pieces that visibly travel for a move: the mover, plus the rook when castling. */
export const moveAnimations = (move: Move): MoveAnimation[] => {
  const from = moveFrom(move);
  const to = moveTo(move);
  const animations: MoveAnimation[] = [{ from, to }];
  if (isCastle(move)) {
    const rank = squareRank(from);
    const kingside = to > from;
    animations.push({
      from: makeSquare(kingside ? 7 : 0, rank),
      to: kingside ? to - 1 : to + 1,
    });
  }
  return animations;
};
