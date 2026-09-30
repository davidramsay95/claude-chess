import { isValidSquare } from "./board";
import { getLegalMoves, isInCheckAt, tryApplyMove } from "./moves";
import type { GameState, Move, Piece, PieceType } from "./types";

/** `{from:'e2',to:'e4'}` -> `'e2e4'`. Castling and promotion follow UCI convention. */
export function moveToUci(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

const PROMOTION_CHARS = new Set(["q", "r", "b", "n"]);

/**
 * Parses a UCI move string into a `Move`, or `null` if the string isn't
 * even well-formed for this position (unknown squares, or no piece of the
 * side to move on the `from` square). Full legality (leaving your own king
 * in check, etc.) is left to `makeMove`.
 */
export function uciToMove(state: GameState, uci: string): Move | null {
  if (uci.length !== 4 && uci.length !== 5) return null;

  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotionChar = uci.length === 5 ? uci[4] : undefined;

  if (!isValidSquare(from) || !isValidSquare(to)) return null;
  if (promotionChar !== undefined && !PROMOTION_CHARS.has(promotionChar)) return null;

  const fromIndex = squareIndex(from);
  const piece = state.board[fromIndex];
  if (!piece || piece.color !== state.turn) return null;

  const move: Move = {
    from,
    to,
    ...(promotionChar ? { promotion: promotionChar as "q" | "r" | "b" | "n" } : {}),
  };
  return move;
}

function squareIndex(square: string): number {
  const file = square.charCodeAt(0) - "a".charCodeAt(0);
  const rank = square.charCodeAt(1) - "1".charCodeAt(0);
  return rank * 8 + file;
}

const PIECE_LETTER: Record<PieceType, string> = {
  p: "",
  n: "N",
  b: "B",
  r: "R",
  q: "Q",
  k: "K",
};

/**
 * Generates Standard Algebraic Notation for a move that has already been
 * verified legal in `beforeState` and applied to reach `afterState`. Kept
 * best-effort (per the spec this is a "nice to have" for move-list display,
 * not something the rules engine depends on) but does implement
 * disambiguation, captures, castling, promotion and check/mate suffixes.
 */
export function moveToSan(
  beforeState: GameState,
  move: Move,
  movedPiece: Piece,
  isCapture: boolean,
  afterState: GameState,
): string {
  const isCastle = movedPiece.type === "k" && move.from[0] === "e" && (move.to === "g1" || move.to === "c1" || move.to === "g8" || move.to === "c8");
  if (isCastle) {
    const base = move.to[0] === "g" ? "O-O" : "O-O-O";
    return base + checkSuffix(afterState);
  }

  let san = "";
  if (movedPiece.type === "p") {
    if (isCapture) san += move.from[0];
  } else {
    san += PIECE_LETTER[movedPiece.type];
    san += disambiguation(beforeState, move, movedPiece);
  }

  if (isCapture) san += "x";
  san += move.to;

  if (move.promotion) {
    san += "=" + PIECE_LETTER[move.promotion];
  }

  san += checkSuffix(afterState);
  return san;
}

function disambiguation(beforeState: GameState, move: Move, movedPiece: Piece): string {
  const others = getLegalMoves(beforeState).filter((candidate) => {
    if (candidate.to !== move.to || candidate.from === move.from) return false;
    const piece = beforeState.board[squareIndex(candidate.from)];
    return piece !== null && piece.type === movedPiece.type && piece.color === movedPiece.color;
  });

  if (others.length === 0) return "";

  const sameFile = others.some((candidate) => candidate.from[0] === move.from[0]);
  const sameRank = others.some((candidate) => candidate.from[1] === move.from[1]);

  if (!sameFile) return move.from[0];
  if (!sameRank) return move.from[1];
  return move.from;
}

function checkSuffix(afterState: GameState): string {
  const inCheck = isInCheckAt(afterState.board, afterState.turn);
  if (!inCheck) return "";
  const hasReply = getLegalMoves(afterState).length > 0;
  return hasReply ? "+" : "#";
}

// Re-exported for convenience so `notation.ts` consumers don't need to reach
// into `moves.ts` directly just to check "is this UCI move actually legal".
export function isLegalUci(state: GameState, uci: string): boolean {
  const move = uciToMove(state, uci);
  if (!move) return false;
  return tryApplyMove(state, move) !== null;
}
