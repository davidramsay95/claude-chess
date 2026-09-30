import { Board, fileOf, rankOf, sq0x88 } from "./board.ts";
import { generateLegal } from "./movegen.ts";
import { BISHOP, EMPTY, KING, KNIGHT, pieceColor, pieceType } from "./types.ts";

export function hasLegalMoves(board: Board): boolean {
  return generateLegal(board).length > 0;
}

export function isCheckmate(board: Board): boolean {
  return board.inCheck() && !hasLegalMoves(board);
}

export function isStalemate(board: Board): boolean {
  return !board.inCheck() && !hasLegalMoves(board);
}

/**
 * True when no sequence of legal moves could produce checkmate for either
 * side: lone kings, king plus a single minor, or only same-coloured bishops.
 */
export function isInsufficientMaterial(board: Board): boolean {
  let knights = 0;
  const bishopSquareColors: number[] = [];
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board.squares[sq0x88(file, rank)];
      if (piece === EMPTY) continue;
      const type = pieceType(piece);
      if (type === KING) continue;
      if (type === KNIGHT) {
        knights++;
      } else if (type === BISHOP) {
        bishopSquareColors.push((file + rank) & 1);
      } else {
        return false; // a pawn, rook or queen can mate
      }
    }
  }

  const bishops = bishopSquareColors.length;
  const minors = knights + bishops;
  if (minors <= 1) return true; // K v K, or K + one minor v K
  if (knights === 0 && bishopSquareColors.every((c) => c === bishopSquareColors[0])) {
    return true; // only bishops, all on one square colour
  }
  return false;
}

/** Fifty-move rule: 100 half-moves without a pawn move or capture. */
export function isFiftyMoveDraw(board: Board): boolean {
  return board.halfmove >= 100;
}

// Kept exported so callers can reason about squares without re-importing helpers.
export { fileOf, rankOf, pieceColor };
