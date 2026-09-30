import {
  BISHOP_DIRS,
  Board,
  KING_OFFSETS,
  KNIGHT_OFFSETS,
  onBoard,
  rankOf,
  ROOK_DIRS,
  sq0x88,
} from "./board.ts";
import {
  BISHOP,
  CASTLE_BK,
  CASTLE_BQ,
  CASTLE_WK,
  CASTLE_WQ,
  Color,
  EMPTY,
  FLAG_CASTLE_KING,
  FLAG_CASTLE_QUEEN,
  FLAG_DOUBLE_PUSH,
  FLAG_EN_PASSANT,
  FLAG_NORMAL,
  KING,
  KNIGHT,
  makePiece,
  Move,
  PAWN,
  Piece,
  pieceColor,
  pieceType,
  PieceType,
  QUEEN,
  ROOK,
  WHITE,
} from "./types.ts";

const PROMOTION_TYPES: PieceType[] = [QUEEN, ROOK, BISHOP, KNIGHT];

function pushMove(
  moves: Move[],
  from: number,
  to: number,
  piece: Piece,
  captured: Piece,
  promotion: PieceType | 0,
  flag: number,
): void {
  moves.push({ from, to, piece, captured, promotion, flag });
}

function addPawnMoves(
  moves: Move[],
  from: number,
  to: number,
  piece: Piece,
  captured: Piece,
  flag: number,
  promotionRank: number,
): void {
  if (rankOf(to) === promotionRank) {
    for (const type of PROMOTION_TYPES) {
      pushMove(moves, from, to, piece, captured, type, flag);
    }
  } else {
    pushMove(moves, from, to, piece, captured, 0, flag);
  }
}

/** Generate every pseudo-legal move (king may be left in check). */
export function generatePseudoLegal(board: Board): Move[] {
  const moves: Move[] = [];
  const squares = board.squares;
  const us = board.turn;
  const them: Color = (us ^ 1) as Color;

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const from = sq0x88(file, rank);
      const piece = squares[from];
      if (piece === EMPTY || pieceColor(piece) !== us) continue;
      const type = pieceType(piece);

      switch (type) {
        case PAWN:
          generatePawn(board, moves, from, piece, us, them);
          break;
        case KNIGHT:
          generateHopper(squares, moves, from, piece, them, KNIGHT_OFFSETS);
          break;
        case KING:
          generateHopper(squares, moves, from, piece, them, KING_OFFSETS);
          generateCastling(board, moves, from, piece, us, them);
          break;
        case BISHOP:
          generateSlider(squares, moves, from, piece, them, BISHOP_DIRS);
          break;
        case ROOK:
          generateSlider(squares, moves, from, piece, them, ROOK_DIRS);
          break;
        case QUEEN:
          generateSlider(squares, moves, from, piece, them, BISHOP_DIRS);
          generateSlider(squares, moves, from, piece, them, ROOK_DIRS);
          break;
      }
    }
  }
  return moves;
}

function generatePawn(
  board: Board,
  moves: Move[],
  from: number,
  piece: Piece,
  us: Color,
  them: Color,
): void {
  const squares = board.squares;
  const forward = us === WHITE ? 16 : -16;
  const startRank = us === WHITE ? 1 : 6;
  const promoRank = us === WHITE ? 7 : 0;

  const one = from + forward;
  if (onBoard(one) && squares[one] === EMPTY) {
    addPawnMoves(moves, from, one, piece, EMPTY, FLAG_NORMAL, promoRank);
    const two = from + forward * 2;
    if (rankOf(from) === startRank && squares[two] === EMPTY) {
      pushMove(moves, from, two, piece, EMPTY, 0, FLAG_DOUBLE_PUSH);
    }
  }

  for (const diag of [forward - 1, forward + 1]) {
    const to = from + diag;
    if (!onBoard(to)) continue;
    const target = squares[to];
    if (target !== EMPTY && pieceColor(target) === them) {
      addPawnMoves(moves, from, to, piece, target, FLAG_NORMAL, promoRank);
    } else if (to === board.ep && target === EMPTY) {
      const capturedPawn = makePiece(PAWN, them);
      pushMove(moves, from, to, piece, capturedPawn, 0, FLAG_EN_PASSANT);
    }
  }
}

function generateHopper(
  squares: Int8Array,
  moves: Move[],
  from: number,
  piece: Piece,
  them: Color,
  offsets: number[],
): void {
  for (const off of offsets) {
    const to = from + off;
    if (!onBoard(to)) continue;
    const target = squares[to];
    if (target === EMPTY) {
      pushMove(moves, from, to, piece, EMPTY, 0, FLAG_NORMAL);
    } else if (pieceColor(target) === them) {
      pushMove(moves, from, to, piece, target, 0, FLAG_NORMAL);
    }
  }
}

function generateSlider(
  squares: Int8Array,
  moves: Move[],
  from: number,
  piece: Piece,
  them: Color,
  dirs: number[],
): void {
  for (const dir of dirs) {
    let to = from + dir;
    while (onBoard(to)) {
      const target = squares[to];
      if (target === EMPTY) {
        pushMove(moves, from, to, piece, EMPTY, 0, FLAG_NORMAL);
      } else {
        if (pieceColor(target) === them) {
          pushMove(moves, from, to, piece, target, 0, FLAG_NORMAL);
        }
        break;
      }
      to += dir;
    }
  }
}

function generateCastling(
  board: Board,
  moves: Move[],
  from: number,
  piece: Piece,
  us: Color,
  them: Color,
): void {
  const squares = board.squares;
  const rank = us === WHITE ? 0 : 7;
  if (from !== sq0x88(4, rank)) return; // king must be on its home square
  if (board.isSquareAttacked(from, them)) return; // cannot castle out of check

  const kingRight = us === WHITE ? CASTLE_WK : CASTLE_BK;
  const queenRight = us === WHITE ? CASTLE_WQ : CASTLE_BQ;

  if (board.castling & kingRight) {
    const f = sq0x88(5, rank);
    const g = sq0x88(6, rank);
    if (
      squares[f] === EMPTY &&
      squares[g] === EMPTY &&
      !board.isSquareAttacked(f, them) &&
      !board.isSquareAttacked(g, them)
    ) {
      pushMove(moves, from, g, piece, EMPTY, 0, FLAG_CASTLE_KING);
    }
  }
  if (board.castling & queenRight) {
    const b = sq0x88(1, rank);
    const c = sq0x88(2, rank);
    const d = sq0x88(3, rank);
    if (
      squares[b] === EMPTY &&
      squares[c] === EMPTY &&
      squares[d] === EMPTY &&
      !board.isSquareAttacked(d, them) &&
      !board.isSquareAttacked(c, them)
    ) {
      pushMove(moves, from, c, piece, EMPTY, 0, FLAG_CASTLE_QUEEN);
    }
  }
}

/** Generate only fully legal moves (king not left in check). */
export function generateLegal(board: Board): Move[] {
  const pseudo = generatePseudoLegal(board);
  const legal: Move[] = [];
  const us = board.turn;
  for (const move of pseudo) {
    board.make(move);
    if (!board.inCheck(us)) legal.push(move);
    board.unmake(move);
  }
  return legal;
}

/** Count leaf nodes at a given depth — the standard move-generation gauge. */
export function perft(board: Board, depth: number): number {
  if (depth === 0) return 1;
  const moves = generatePseudoLegal(board);
  const us = board.turn;
  let nodes = 0;
  for (const move of moves) {
    board.make(move);
    if (!board.inCheck(us)) {
      nodes += depth === 1 ? 1 : perft(board, depth - 1);
    }
    board.unmake(move);
  }
  return nodes;
}
