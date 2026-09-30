import {
  EMPTY, WHITE, BLACK, KING, QUEEN, PAWN, KNIGHT, BISHOP, ROOK,
  W_PAWN, W_KNIGHT, W_BISHOP, W_ROOK, W_QUEEN, W_KING,
  B_PAWN, B_KNIGHT, B_BISHOP, B_ROOK, B_QUEEN, B_KING,
  CASTLE_WK, CASTLE_WQ, CASTLE_BK, CASTLE_BQ,
  FLAG_CAPTURE, FLAG_DOUBLE_PUSH, FLAG_EN_PASSANT, FLAG_CASTLE_KS, FLAG_CASTLE_QS,
  pieceType, pieceColor, makePiece,
  squareFile, squareRank, squareIndex,
  squareToAlgebraic, algebraicToSquare,
  fenCharToPiece, pieceToFenChar, uciCharToPieceType, pieceTypeToUciChar,
  PIECE_VALUE,
} from "./constants.js";

export interface Move {
  from: number;
  to: number;
  promotion: number;
  flags: number;
  // Saved state for unmake:
  capturedPiece: number;
  prevCastlingRights: number;
  prevEnPassant: number;
  prevHalfMoveClock: number;
}

export interface BoardState {
  squares: number[];
  sideToMove: number;
  castlingRights: number;
  enPassantSquare: number;
  halfMoveClock: number;
  fullMoveNumber: number;
}

export const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function createMove(
  from: number,
  to: number,
  promotion: number,
  flags: number
): Move {
  return { from, to, promotion, flags, capturedPiece: 0, prevCastlingRights: 0, prevEnPassant: -1, prevHalfMoveClock: 0 };
}

export function parseFen(fen: string): BoardState {
  const parts = fen.trim().split(/\s+/);
  const squares = new Array(64).fill(EMPTY);

  let rank = 7;
  let file = 0;
  for (const ch of parts[0]) {
    if (ch === "/") {
      rank--;
      file = 0;
    } else if (ch >= "1" && ch <= "8") {
      file += parseInt(ch, 10);
    } else {
      squares[squareIndex(rank, file)] = fenCharToPiece(ch);
      file++;
    }
  }

  const sideToMove = parts[1] === "b" ? BLACK : WHITE;

  let castlingRights = 0;
  if (parts[2].includes("K")) castlingRights |= CASTLE_WK;
  if (parts[2].includes("Q")) castlingRights |= CASTLE_WQ;
  if (parts[2].includes("k")) castlingRights |= CASTLE_BK;
  if (parts[2].includes("q")) castlingRights |= CASTLE_BQ;

  const enPassantSquare = parts[3] === "-" ? -1 : algebraicToSquare(parts[3]);
  const halfMoveClock = parts[4] ? parseInt(parts[4], 10) : 0;
  const fullMoveNumber = parts[5] ? parseInt(parts[5], 10) : 1;

  return { squares, sideToMove, castlingRights, enPassantSquare, halfMoveClock, fullMoveNumber };
}

export function boardToFen(board: BoardState): string {
  let fen = "";

  for (let r = 7; r >= 0; r--) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const piece = board.squares[squareIndex(r, f)];
      if (piece === EMPTY) {
        empty++;
      } else {
        if (empty > 0) { fen += empty; empty = 0; }
        fen += pieceToFenChar(piece);
      }
    }
    if (empty > 0) fen += empty;
    if (r > 0) fen += "/";
  }

  fen += " " + (board.sideToMove === WHITE ? "w" : "b");

  let castle = "";
  if (board.castlingRights & CASTLE_WK) castle += "K";
  if (board.castlingRights & CASTLE_WQ) castle += "Q";
  if (board.castlingRights & CASTLE_BK) castle += "k";
  if (board.castlingRights & CASTLE_BQ) castle += "q";
  fen += " " + (castle || "-");

  fen += " " + (board.enPassantSquare === -1 ? "-" : squareToAlgebraic(board.enPassantSquare));
  fen += " " + board.halfMoveClock + " " + board.fullMoveNumber;

  return fen;
}

export function cloneBoard(board: BoardState): BoardState {
  return {
    squares: [...board.squares],
    sideToMove: board.sideToMove,
    castlingRights: board.castlingRights,
    enPassantSquare: board.enPassantSquare,
    halfMoveClock: board.halfMoveClock,
    fullMoveNumber: board.fullMoveNumber,
  };
}

export function positionKey(board: BoardState): string {
  return (
    board.squares.join(",") +
    "|" + board.sideToMove +
    "|" + board.castlingRights +
    "|" + board.enPassantSquare
  );
}

// ─── Move make/unmake ────────────────────────────────────────────────────────

export function makeMove(board: BoardState, move: Move): void {
  const { from, to, promotion, flags } = move;
  const side = board.sideToMove;
  const piece = board.squares[from];

  // Save undo info
  move.capturedPiece = board.squares[to];
  move.prevCastlingRights = board.castlingRights;
  move.prevEnPassant = board.enPassantSquare;
  move.prevHalfMoveClock = board.halfMoveClock;

  // Move piece
  board.squares[from] = EMPTY;
  board.squares[to] = promotion ? makePiece(promotion, side) : piece;

  // En passant capture: remove the captured pawn
  if (flags & FLAG_EN_PASSANT) {
    const capturedSq = to - (side === WHITE ? 8 : -8);
    move.capturedPiece = board.squares[capturedSq];
    board.squares[capturedSq] = EMPTY;
    board.squares[to] = promotion ? makePiece(promotion, side) : piece;
  }

  // Castling: move rook
  if (flags & FLAG_CASTLE_KS) {
    if (side === WHITE) { board.squares[7] = EMPTY; board.squares[5] = W_ROOK; }
    else { board.squares[63] = EMPTY; board.squares[61] = B_ROOK; }
  } else if (flags & FLAG_CASTLE_QS) {
    if (side === WHITE) { board.squares[0] = EMPTY; board.squares[3] = W_ROOK; }
    else { board.squares[56] = EMPTY; board.squares[59] = B_ROOK; }
  }

  // Update en passant square
  board.enPassantSquare = (flags & FLAG_DOUBLE_PUSH)
    ? (side === WHITE ? from + 8 : from - 8)
    : -1;

  // Update castling rights
  if (pieceType(piece) === KING) {
    board.castlingRights &= side === WHITE ? ~(CASTLE_WK | CASTLE_WQ) : ~(CASTLE_BK | CASTLE_BQ);
  }
  if (from === 0 || to === 0) board.castlingRights &= ~CASTLE_WQ;
  if (from === 7 || to === 7) board.castlingRights &= ~CASTLE_WK;
  if (from === 56 || to === 56) board.castlingRights &= ~CASTLE_BQ;
  if (from === 63 || to === 63) board.castlingRights &= ~CASTLE_BK;

  // Half-move clock
  if (pieceType(piece) === PAWN || move.capturedPiece !== EMPTY || flags & FLAG_EN_PASSANT) {
    board.halfMoveClock = 0;
  } else {
    board.halfMoveClock++;
  }

  if (side === BLACK) board.fullMoveNumber++;
  board.sideToMove = 1 - side;
}

export function unmakeMove(board: BoardState, move: Move): void {
  const { from, to, promotion, flags } = move;
  const side = 1 - board.sideToMove; // the side that made the move

  board.sideToMove = side;
  board.castlingRights = move.prevCastlingRights;
  board.enPassantSquare = move.prevEnPassant;
  board.halfMoveClock = move.prevHalfMoveClock;
  if (side === BLACK) board.fullMoveNumber--;

  // Restore moved piece
  const movedPiece = promotion ? makePiece(PAWN, side) : board.squares[to];
  board.squares[from] = movedPiece;

  if (flags & FLAG_EN_PASSANT) {
    board.squares[to] = EMPTY;
    const capturedSq = to - (side === WHITE ? 8 : -8);
    board.squares[capturedSq] = move.capturedPiece;
  } else {
    board.squares[to] = move.capturedPiece;
  }

  // Restore castling rook
  if (flags & FLAG_CASTLE_KS) {
    if (side === WHITE) { board.squares[5] = EMPTY; board.squares[7] = W_ROOK; }
    else { board.squares[61] = EMPTY; board.squares[63] = B_ROOK; }
  } else if (flags & FLAG_CASTLE_QS) {
    if (side === WHITE) { board.squares[3] = EMPTY; board.squares[0] = W_ROOK; }
    else { board.squares[59] = EMPTY; board.squares[56] = B_ROOK; }
  }
}

// ─── UCI conversion ──────────────────────────────────────────────────────────

export function moveToUci(move: Move): string {
  return (
    squareToAlgebraic(move.from) +
    squareToAlgebraic(move.to) +
    (move.promotion ? pieceTypeToUciChar(move.promotion) : "")
  );
}

export function uciToMove(uci: string, board: BoardState): Move | null {
  if (uci.length < 4) return null;
  const from = algebraicToSquare(uci.substring(0, 2));
  const to = algebraicToSquare(uci.substring(2, 4));
  const promotion = uci.length === 5 ? uciCharToPieceType(uci[4]) : 0;

  if (from < 0 || from > 63 || to < 0 || to > 63) return null;

  const piece = board.squares[from];
  if (piece === EMPTY) return null;

  let flags = 0;
  const target = board.squares[to];

  if (target !== EMPTY) flags |= FLAG_CAPTURE;

  if (pieceType(piece) === PAWN) {
    const fromRank = squareRank(from);
    const toRank = squareRank(to);
    if (Math.abs(fromRank - toRank) === 2) flags |= FLAG_DOUBLE_PUSH;
    if (to === board.enPassantSquare) {
      flags = (flags & ~FLAG_CAPTURE) | FLAG_EN_PASSANT;
    }
  }

  if (pieceType(piece) === KING) {
    const df = squareFile(to) - squareFile(from);
    if (df === 2) flags |= FLAG_CASTLE_KS;
    else if (df === -2) flags |= FLAG_CASTLE_QS;
  }

  return createMove(from, to, promotion, flags);
}

// ─── Attack detection ────────────────────────────────────────────────────────

export function isSquareAttacked(
  board: BoardState,
  sq: number,
  byColor: number
): boolean {
  const r = squareRank(sq);
  const f = squareFile(sq);

  // Pawn attacks
  if (byColor === WHITE) {
    if (r > 0 && f > 0 && board.squares[sq - 9] === W_PAWN) return true;
    if (r > 0 && f < 7 && board.squares[sq - 7] === W_PAWN) return true;
  } else {
    if (r < 7 && f > 0 && board.squares[sq + 7] === B_PAWN) return true;
    if (r < 7 && f < 7 && board.squares[sq + 9] === B_PAWN) return true;
  }

  // Knight attacks
  const knightDeltas = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const knightPiece = byColor === WHITE ? W_KNIGHT : B_KNIGHT;
  for (const [dr, df2] of knightDeltas) {
    const nr = r + dr;
    const nf = f + df2;
    if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8 && board.squares[squareIndex(nr, nf)] === knightPiece) {
      return true;
    }
  }

  // Bishop / Queen diagonals
  const bishopPiece = byColor === WHITE ? W_BISHOP : B_BISHOP;
  const queenPiece = byColor === WHITE ? W_QUEEN : B_QUEEN;
  for (const [dr, df2] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    let nr = r + dr;
    let nf = f + df2;
    while (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
      const p = board.squares[squareIndex(nr, nf)];
      if (p !== EMPTY) {
        if (p === bishopPiece || p === queenPiece) return true;
        break;
      }
      nr += dr;
      nf += df2;
    }
  }

  // Rook / Queen straights
  const rookPiece = byColor === WHITE ? W_ROOK : B_ROOK;
  for (const [dr, df2] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    let nr = r + dr;
    let nf = f + df2;
    while (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
      const p = board.squares[squareIndex(nr, nf)];
      if (p !== EMPTY) {
        if (p === rookPiece || p === queenPiece) return true;
        break;
      }
      nr += dr;
      nf += df2;
    }
  }

  // King
  const kingPiece = byColor === WHITE ? W_KING : B_KING;
  for (let dr = -1; dr <= 1; dr++) {
    for (let df2 = -1; df2 <= 1; df2++) {
      if (dr === 0 && df2 === 0) continue;
      const nr = r + dr;
      const nf = f + df2;
      if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8 && board.squares[squareIndex(nr, nf)] === kingPiece) {
        return true;
      }
    }
  }

  return false;
}

export function isKingInCheck(board: BoardState, side: number): boolean {
  const kingPiece = side === WHITE ? W_KING : B_KING;
  const kingSq = board.squares.indexOf(kingPiece);
  if (kingSq === -1) return false;
  return isSquareAttacked(board, kingSq, 1 - side);
}

// ─── Insufficient material ───────────────────────────────────────────────────

export function isInsufficientMaterial(board: BoardState): boolean {
  const pieces: Array<{ type: number; color: number; sq: number }> = [];
  for (let sq = 0; sq < 64; sq++) {
    const p = board.squares[sq];
    if (p !== EMPTY) pieces.push({ type: pieceType(p), color: pieceColor(p), sq });
  }

  const nonKings = pieces.filter((p) => p.type !== KING);

  if (nonKings.length === 0) return true;

  if (nonKings.length === 1) {
    return nonKings[0].type === KNIGHT || nonKings[0].type === BISHOP;
  }

  if (nonKings.length === 2) {
    const [p1, p2] = nonKings;
    if (
      p1.type === BISHOP &&
      p2.type === BISHOP &&
      p1.color !== p2.color
    ) {
      const sq1Color = (squareRank(p1.sq) + squareFile(p1.sq)) & 1;
      const sq2Color = (squareRank(p2.sq) + squareFile(p2.sq)) & 1;
      return sq1Color === sq2Color;
    }
  }

  return false;
}

// Re-export everything needed by other modules
export {
  EMPTY, WHITE, BLACK, KING, QUEEN, PAWN, KNIGHT, BISHOP, ROOK,
  W_PAWN, W_KNIGHT, W_BISHOP, W_ROOK, W_QUEEN, W_KING,
  B_PAWN, B_KNIGHT, B_BISHOP, B_ROOK, B_QUEEN, B_KING,
  CASTLE_WK, CASTLE_WQ, CASTLE_BK, CASTLE_BQ,
  FLAG_CAPTURE, FLAG_DOUBLE_PUSH, FLAG_EN_PASSANT, FLAG_CASTLE_KS, FLAG_CASTLE_QS,
  pieceType, pieceColor, makePiece,
  squareFile, squareRank, squareIndex,
  squareToAlgebraic, algebraicToSquare,
  PIECE_VALUE,
};
