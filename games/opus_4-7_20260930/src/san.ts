import { Game } from "./engine/game.js";
import { Move, pieceType, fileOf, rankOf, algebraicOf } from "./engine/types.js";
import { makeMove, inCheck, generateLegalMoves } from "./engine/moves.js";

/**
 * Convert a legal move (in the current position) to Standard Algebraic Notation
 * with check/checkmate suffix. Not a general SAN parser — just an output helper.
 */
export function moveToSan(g: Game, mv: Move): string {
  const pos = g.position;
  const piece = pos.board[mv.from];
  if (!piece) return "?";
  const t = pieceType(piece);
  const isCapture = pos.board[mv.to] !== null || (t === "p" && pos.epTarget === mv.to && fileOf(mv.from) !== fileOf(mv.to));

  // Castling
  if (t === "k" && Math.abs(fileOf(mv.to) - fileOf(mv.from)) === 2) {
    const base = fileOf(mv.to) === 6 ? "O-O" : "O-O-O";
    return base + checkSuffix(pos, mv);
  }

  let s = "";
  if (t === "p") {
    if (isCapture) s += String.fromCharCode(97 + fileOf(mv.from)) + "x";
    s += algebraicOf(mv.to);
    if (mv.promo) s += "=" + mv.promo.toUpperCase();
  } else {
    s += t.toUpperCase();
    // Disambiguate against other pieces of same type that could move to mv.to
    const legal = generateLegalMoves(pos);
    const same = legal.filter(m => m.from !== mv.from && m.to === mv.to && pos.board[m.from] && pieceType(pos.board[m.from]!) === t);
    if (same.length > 0) {
      const sameFile = same.some(m => fileOf(m.from) === fileOf(mv.from));
      const sameRank = same.some(m => rankOf(m.from) === rankOf(mv.from));
      if (!sameFile) s += String.fromCharCode(97 + fileOf(mv.from));
      else if (!sameRank) s += (rankOf(mv.from) + 1).toString();
      else s += algebraicOf(mv.from);
    }
    if (isCapture) s += "x";
    s += algebraicOf(mv.to);
  }
  s += checkSuffix(pos, mv);
  return s;
}

function checkSuffix(pos: import("./engine/types.js").Position, mv: Move): string {
  const { next } = makeMove(pos, mv);
  if (!inCheck(next, next.turn)) return "";
  const legal = generateLegalMoves(next);
  return legal.length === 0 ? "#" : "+";
}
