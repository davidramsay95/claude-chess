import { Board, squareToAlgebraic, algebraicToSquare } from "./board.ts";
import { generateLegal } from "./movegen.ts";
import {
  BISHOP,
  EMPTY,
  FLAG_CASTLE_KING,
  FLAG_CASTLE_QUEEN,
  FLAG_EN_PASSANT,
  KNIGHT,
  Move,
  PAWN,
  pieceType,
  PieceType,
  QUEEN,
  ROOK,
} from "./types.ts";

const TYPE_LETTER: Record<number, string> = {
  [KNIGHT]: "N",
  [BISHOP]: "B",
  [ROOK]: "R",
  [QUEEN]: "Q",
};
const PROMO_LETTER: Record<number, string> = {
  [QUEEN]: "q",
  [ROOK]: "r",
  [BISHOP]: "b",
  [KNIGHT]: "n",
};
const LETTER_PROMO: Record<string, PieceType> = {
  q: QUEEN,
  r: ROOK,
  b: BISHOP,
  n: KNIGHT,
};

/** Encode a move as a UCI string ("e2e4", "e7e8q", "e1g1"). */
export function moveToUci(move: Move): string {
  const promo = move.promotion ? PROMO_LETTER[move.promotion] : "";
  return squareToAlgebraic(move.from) + squareToAlgebraic(move.to) + promo;
}

/**
 * Resolve a UCI string against the legal moves of `board`.
 * Returns the matching `Move`, or null if the string is malformed or illegal.
 */
export function parseUci(board: Board, uci: string): Move | null {
  if (uci.length < 4 || uci.length > 5) return null;
  const from = algebraicToSquare(uci.slice(0, 2));
  const to = algebraicToSquare(uci.slice(2, 4));
  if (from < 0 || to < 0) return null;
  const promoChar = uci.length === 5 ? uci[4].toLowerCase() : "";
  const promo = promoChar ? LETTER_PROMO[promoChar] : 0;
  if (promoChar && !promo) return null;

  for (const move of generateLegal(board)) {
    if (move.from === from && move.to === to && (move.promotion || 0) === (promo || 0)) {
      return move;
    }
  }
  return null;
}

/** Render a legal move as Standard Algebraic Notation, with check/mate suffix. */
export function moveToSan(board: Board, move: Move): string {
  if (move.flag === FLAG_CASTLE_KING) return withSuffix(board, move, "O-O");
  if (move.flag === FLAG_CASTLE_QUEEN) return withSuffix(board, move, "O-O-O");

  const type = pieceType(move.piece);
  const isCapture = move.captured !== EMPTY || move.flag === FLAG_EN_PASSANT;
  const dest = squareToAlgebraic(move.to);
  let text: string;

  if (type === PAWN) {
    text = isCapture ? `${squareToAlgebraic(move.from)[0]}x${dest}` : dest;
    if (move.promotion) text += `=${TYPE_LETTER[move.promotion] ?? "Q"}`;
  } else {
    const letter = TYPE_LETTER[type] ?? "K";
    text = letter + disambiguation(board, move) + (isCapture ? "x" : "") + dest;
  }
  return withSuffix(board, move, text);
}

function disambiguation(board: Board, move: Move): string {
  const type = pieceType(move.piece);
  const rivals = generateLegal(board).filter(
    (m) => m.to === move.to && m.from !== move.from && pieceType(m.piece) === type,
  );
  if (rivals.length === 0) return "";
  const fromAlg = squareToAlgebraic(move.from);
  const sameFile = rivals.some((m) => squareToAlgebraic(m.from)[0] === fromAlg[0]);
  const sameRank = rivals.some((m) => squareToAlgebraic(m.from)[1] === fromAlg[1]);
  if (!sameFile) return fromAlg[0];
  if (!sameRank) return fromAlg[1];
  return fromAlg;
}

function withSuffix(board: Board, move: Move, text: string): string {
  board.make(move);
  let suffix = "";
  if (board.inCheck()) {
    suffix = generateLegal(board).length === 0 ? "#" : "+";
  }
  board.unmake(move);
  return text + suffix;
}
