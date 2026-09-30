// Central re-export of engine API used by the app and worker

export type { Move, BoardState } from "./board.js";
export {
  parseFen, boardToFen, cloneBoard, positionKey,
  makeMove, unmakeMove,
  moveToUci, uciToMove,
  isKingInCheck, isSquareAttacked, isInsufficientMaterial,
  STARTING_FEN,
  EMPTY, WHITE, BLACK,
  PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
  W_PAWN, W_KNIGHT, W_BISHOP, W_ROOK, W_QUEEN, W_KING,
  B_PAWN, B_KNIGHT, B_BISHOP, B_ROOK, B_QUEEN, B_KING,
  FLAG_CAPTURE, FLAG_DOUBLE_PUSH, FLAG_EN_PASSANT, FLAG_CASTLE_KS, FLAG_CASTLE_QS,
  pieceType, pieceColor, makePiece,
  squareFile, squareRank, squareIndex,
  squareToAlgebraic, algebraicToSquare,
  PIECE_VALUE,
} from "./board.js";
export { generateLegalMoves, perft } from "./moveGen.js";
export { findBestMove } from "./search.js";
export type { SearchResult } from "./search.js";
