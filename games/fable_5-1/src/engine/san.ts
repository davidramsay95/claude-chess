import { KING, PAWN, PIECE_LETTERS, fileOf, pieceTypeOf, rankOf, squareToAlgebraic } from "./types";
import { isCapture, isCastle, moveFrom, movePromotion, moveTo, type Move } from "./move";
import type { Position } from "./position";

/** Standard Algebraic Notation for a legal move in the given position (the position is left unchanged). */
export const moveToSan = (pos: Position, move: Move): string => {
  const from = moveFrom(move);
  const to = moveTo(move);
  const type = pieceTypeOf(pos.pieceAt(from));
  let text: string;

  if (isCastle(move)) {
    text = fileOf(to) > fileOf(from) ? "O-O" : "O-O-O";
  } else if (type === PAWN) {
    text = isCapture(move) ? `${"abcdefgh"[fileOf(from)]}x` : "";
    text += squareToAlgebraic(to);
    const promo = movePromotion(move);
    if (promo) text += `=${PIECE_LETTERS[promo]}`;
  } else {
    text = PIECE_LETTERS[type] + disambiguation(pos, move, type);
    if (isCapture(move)) text += "x";
    text += squareToAlgebraic(to);
  }

  pos.makeMove(move);
  if (pos.inCheck()) text += pos.legalMoves().length === 0 ? "#" : "+";
  pos.undoMove();
  return text;
};

const disambiguation = (pos: Position, move: Move, type: number): string => {
  if (type === KING) return "";
  const from = moveFrom(move);
  const to = moveTo(move);
  const rivals = pos
    .legalMoves()
    .filter((m) => m !== move && moveTo(m) === to && pieceTypeOf(pos.pieceAt(moveFrom(m))) === type)
    .map(moveFrom);
  if (rivals.length === 0) return "";
  const sameFile = rivals.some((sq) => fileOf(sq) === fileOf(from));
  const sameRank = rivals.some((sq) => rankOf(sq) === rankOf(from));
  if (!sameFile) return "abcdefgh"[fileOf(from)];
  if (!sameRank) return String(rankOf(from) + 1);
  return squareToAlgebraic(from);
};
