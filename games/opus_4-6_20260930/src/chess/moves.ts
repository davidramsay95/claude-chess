import {
  type BoardState,
  type Move,
  type Color,
  type Square88,
  type PieceType,
  EMPTY,
  WHITE,
  BLACK,
  PAWN,
  KNIGHT,
  BISHOP,
  ROOK,
  QUEEN,
  KING,
  CASTLE_WK,
  CASTLE_WQ,
  CASTLE_BK,
  CASTLE_BQ,
  FLAG_CAPTURE,
  FLAG_EP,
  FLAG_CASTLE,
  FLAG_PROMOTE,
  FLAG_PAWN_DOUBLE,
  KNIGHT_OFFSETS,
  BISHOP_OFFSETS,
  ROOK_OFFSETS,
  KING_OFFSETS,
  isOnBoard,
  sq88,
  sqRank,
  pieceColor,
  pieceType,
  makePiece,
} from "./types.js";

function mkMove(
  from: Square88,
  to: Square88,
  piece: number,
  captured: number,
  flags: number,
  promotion: PieceType | 0 = 0,
): Move {
  return { from, to, piece, captured, flags, promotion };
}

function addPawnMoves(
  moves: Move[],
  from: Square88,
  to: Square88,
  piece: number,
  captured: number,
  flags: number,
  promRank: number,
): void {
  if (sqRank(to) === promRank) {
    const pf = flags | FLAG_PROMOTE;
    moves.push(mkMove(from, to, piece, captured, pf, QUEEN));
    moves.push(mkMove(from, to, piece, captured, pf, ROOK));
    moves.push(mkMove(from, to, piece, captured, pf, BISHOP));
    moves.push(mkMove(from, to, piece, captured, pf, KNIGHT));
  } else {
    moves.push(mkMove(from, to, piece, captured, flags));
  }
}

export function generatePseudoLegal(state: BoardState): Move[] {
  const moves: Move[] = [];
  const { board, turn, castling, epSquare } = state;
  const opp: Color = (1 - turn) as Color;

  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const piece = board[sq];
    if (piece === EMPTY || pieceColor(piece) !== turn) continue;

    const pt = pieceType(piece);

    if (pt === PAWN) {
      const dir = turn === WHITE ? 16 : -16;
      const startRank = turn === WHITE ? 1 : 6;
      const promRank = turn === WHITE ? 7 : 0;

      const fwd = sq + dir;
      if (isOnBoard(fwd) && board[fwd] === EMPTY) {
        addPawnMoves(moves, sq, fwd, piece, EMPTY, 0, promRank);
        const dbl = fwd + dir;
        if (sqRank(sq) === startRank && board[dbl] === EMPTY) {
          moves.push(mkMove(sq, dbl, piece, EMPTY, FLAG_PAWN_DOUBLE));
        }
      }

      for (const cdir of [dir - 1, dir + 1]) {
        const to = sq + cdir;
        if (!isOnBoard(to)) continue;
        if (board[to] !== EMPTY && pieceColor(board[to]) === opp) {
          addPawnMoves(moves, sq, to, piece, board[to], FLAG_CAPTURE, promRank);
        }
        if (to === epSquare) {
          const epCaptured = makePiece(opp, PAWN);
          moves.push(mkMove(sq, to, piece, epCaptured, FLAG_CAPTURE | FLAG_EP));
        }
      }
    } else if (pt === KNIGHT) {
      for (const offset of KNIGHT_OFFSETS) {
        const to = sq + offset;
        if (!isOnBoard(to)) continue;
        const target = board[to];
        if (target === EMPTY) {
          moves.push(mkMove(sq, to, piece, EMPTY, 0));
        } else if (pieceColor(target) === opp) {
          moves.push(mkMove(sq, to, piece, target, FLAG_CAPTURE));
        }
      }
    } else if (pt === KING) {
      for (const offset of KING_OFFSETS) {
        const to = sq + offset;
        if (!isOnBoard(to)) continue;
        const target = board[to];
        if (target === EMPTY) {
          moves.push(mkMove(sq, to, piece, EMPTY, 0));
        } else if (pieceColor(target) === opp) {
          moves.push(mkMove(sq, to, piece, target, FLAG_CAPTURE));
        }
      }

      if (turn === WHITE && sq === sq88(0, 4)) {
        if (
          (castling & CASTLE_WK) &&
          board[sq88(0, 5)] === EMPTY &&
          board[sq88(0, 6)] === EMPTY &&
          board[sq88(0, 7)] === makePiece(WHITE, ROOK)
        ) {
          moves.push(mkMove(sq, sq88(0, 6), piece, EMPTY, FLAG_CASTLE));
        }
        if (
          (castling & CASTLE_WQ) &&
          board[sq88(0, 3)] === EMPTY &&
          board[sq88(0, 2)] === EMPTY &&
          board[sq88(0, 1)] === EMPTY &&
          board[sq88(0, 0)] === makePiece(WHITE, ROOK)
        ) {
          moves.push(mkMove(sq, sq88(0, 2), piece, EMPTY, FLAG_CASTLE));
        }
      } else if (turn === BLACK && sq === sq88(7, 4)) {
        if (
          (castling & CASTLE_BK) &&
          board[sq88(7, 5)] === EMPTY &&
          board[sq88(7, 6)] === EMPTY &&
          board[sq88(7, 7)] === makePiece(BLACK, ROOK)
        ) {
          moves.push(mkMove(sq, sq88(7, 6), piece, EMPTY, FLAG_CASTLE));
        }
        if (
          (castling & CASTLE_BQ) &&
          board[sq88(7, 3)] === EMPTY &&
          board[sq88(7, 2)] === EMPTY &&
          board[sq88(7, 1)] === EMPTY &&
          board[sq88(7, 0)] === makePiece(BLACK, ROOK)
        ) {
          moves.push(mkMove(sq, sq88(7, 2), piece, EMPTY, FLAG_CASTLE));
        }
      }
    } else {
      const offsets =
        pt === BISHOP
          ? BISHOP_OFFSETS
          : pt === ROOK
            ? ROOK_OFFSETS
            : [...BISHOP_OFFSETS, ...ROOK_OFFSETS];

      for (const offset of offsets) {
        let to = sq + offset;
        while (isOnBoard(to)) {
          const target = board[to];
          if (target === EMPTY) {
            moves.push(mkMove(sq, to, piece, EMPTY, 0));
          } else {
            if (pieceColor(target) === opp) {
              moves.push(mkMove(sq, to, piece, target, FLAG_CAPTURE));
            }
            break;
          }
          to += offset;
        }
      }
    }
  }

  return moves;
}

export function isSquareAttacked(
  board: Uint8Array,
  sq: Square88,
  byColor: Color,
): boolean {
  const pawnDir = byColor === WHITE ? -16 : 16;
  for (const cdir of [pawnDir - 1, pawnDir + 1]) {
    const from = sq + cdir;
    if (isOnBoard(from)) {
      const p = board[from];
      if (p !== EMPTY && pieceColor(p) === byColor && pieceType(p) === PAWN) {
        return true;
      }
    }
  }

  for (const offset of KNIGHT_OFFSETS) {
    const from = sq + offset;
    if (isOnBoard(from)) {
      const p = board[from];
      if (p !== EMPTY && pieceColor(p) === byColor && pieceType(p) === KNIGHT) {
        return true;
      }
    }
  }

  for (const offset of KING_OFFSETS) {
    const from = sq + offset;
    if (isOnBoard(from)) {
      const p = board[from];
      if (p !== EMPTY && pieceColor(p) === byColor && pieceType(p) === KING) {
        return true;
      }
    }
  }

  for (const offset of BISHOP_OFFSETS) {
    let from = sq + offset;
    while (isOnBoard(from)) {
      const p = board[from];
      if (p !== EMPTY) {
        if (
          pieceColor(p) === byColor &&
          (pieceType(p) === BISHOP || pieceType(p) === QUEEN)
        ) {
          return true;
        }
        break;
      }
      from += offset;
    }
  }

  for (const offset of ROOK_OFFSETS) {
    let from = sq + offset;
    while (isOnBoard(from)) {
      const p = board[from];
      if (p !== EMPTY) {
        if (
          pieceColor(p) === byColor &&
          (pieceType(p) === ROOK || pieceType(p) === QUEEN)
        ) {
          return true;
        }
        break;
      }
      from += offset;
    }
  }

  return false;
}

export function isInCheck(state: BoardState, color: Color): boolean {
  return isSquareAttacked(
    state.board,
    state.kings[color],
    (1 - color) as Color,
  );
}

export function generateLegalMoves(state: BoardState): Move[] {
  const pseudo = generatePseudoLegal(state);
  const legal: Move[] = [];
  const opp: Color = (1 - state.turn) as Color;

  for (const move of pseudo) {
    if (move.flags & FLAG_CASTLE) {
      if (isInCheck(state, state.turn)) continue;

      const kingSq = move.from;
      const isKingside = move.to > move.from;
      const throughSq = isKingside ? kingSq + 1 : kingSq - 1;
      if (isSquareAttacked(state.board, throughSq, opp)) continue;
      if (isSquareAttacked(state.board, move.to, opp)) continue;

      legal.push(move);
      continue;
    }

    const { board, kings } = state;
    const fromPiece = board[move.from];
    const toPiece = board[move.to];

    board[move.from] = EMPTY;
    board[move.to] = move.promotion
      ? makePiece(state.turn, move.promotion)
      : fromPiece;

    let epCapturedSq = -1;
    if (move.flags & FLAG_EP) {
      epCapturedSq = state.turn === WHITE ? move.to - 16 : move.to + 16;
      board[epCapturedSq] = EMPTY;
    }

    const kingSq =
      pieceType(fromPiece) === KING ? move.to : kings[state.turn];

    const inCheck = isSquareAttacked(board, kingSq, opp);

    board[move.from] = fromPiece;
    board[move.to] = toPiece;
    if (epCapturedSq >= 0) {
      board[epCapturedSq] = makePiece(opp, PAWN);
    }

    if (!inCheck) {
      legal.push(move);
    }
  }

  return legal;
}
