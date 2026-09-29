import {
  FLAG_CASTLE,
  type Move,
  moveCaptured,
  moveFrom,
  movePiece,
  movePromotion,
  moveTo,
} from "./move";
import type { Position } from "./position";
import { FILES, KING, PAWN, PIECE_LETTERS, RANKS, fileOf, rankOf, squareToName, typeOf } from "./types";

/**
 * Standard algebraic notation for `move` in `pos`. `legalMoves` must be the
 * legal moves of `pos`, which decides how much disambiguation is needed.
 */
export const sanOf = (pos: Position, move: Move, legalMoves: readonly Move[]): string => {
  const piece = movePiece(move);
  const type = typeOf(piece);
  const from = moveFrom(move);
  const to = moveTo(move);
  const captured = moveCaptured(move);
  const promotion = movePromotion(move);

  let text: string;
  if (move & (FLAG_CASTLE << 25)) {
    text = to > from ? "O-O" : "O-O-O";
  } else if (type === PAWN) {
    text = captured ? `${FILES[fileOf(from)]}x${squareToName(to)}` : squareToName(to);
    if (promotion) text += `=${(PIECE_LETTERS[promotion] ?? "").toUpperCase()}`;
  } else {
    const letter = (PIECE_LETTERS[type] ?? "").toUpperCase();
    text = `${letter}${disambiguation(move, legalMoves)}${captured ? "x" : ""}${squareToName(to)}`;
  }

  const undo = pos.makeMove(move);
  if (pos.inCheck()) {
    text += pos.legalMoves().length === 0 ? "#" : "+";
  }
  pos.unmakeMove(move, undo);
  return text;
};

const disambiguation = (move: Move, legalMoves: readonly Move[]): string => {
  const from = moveFrom(move);
  const to = moveTo(move);
  const piece = movePiece(move);
  if (typeOf(piece) === KING) return "";
  const rivals = legalMoves.filter(
    (other) => other !== move && movePiece(other) === piece && moveTo(other) === to && moveFrom(other) !== from,
  );
  if (rivals.length === 0) return "";
  const sameFile = rivals.some((other) => fileOf(moveFrom(other)) === fileOf(from));
  const sameRank = rivals.some((other) => rankOf(moveFrom(other)) === rankOf(from));
  if (!sameFile) return FILES[fileOf(from)] ?? "";
  if (!sameRank) return RANKS[rankOf(from)] ?? "";
  return squareToName(from);
};
