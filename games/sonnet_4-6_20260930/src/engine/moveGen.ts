import {
  EMPTY, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
  W_PAWN, W_KNIGHT, W_BISHOP, W_ROOK, W_QUEEN, W_KING,
  B_PAWN, B_KNIGHT, B_BISHOP, B_ROOK, B_QUEEN, B_KING,
  CASTLE_WK, CASTLE_WQ, CASTLE_BK, CASTLE_BQ,
  FLAG_CAPTURE, FLAG_DOUBLE_PUSH, FLAG_EN_PASSANT, FLAG_CASTLE_KS, FLAG_CASTLE_QS,
  pieceType, pieceColor,
  squareFile, squareRank, squareIndex,
} from "./constants.js";
import {
  BoardState, Move,
  createMove, makeMove, unmakeMove,
  isSquareAttacked, isKingInCheck,
} from "./board.js";

// ─── Pseudo-legal move generation ───────────────────────────────────────────

function addSlidingMoves(
  board: BoardState,
  sq: number,
  rays: ReadonlyArray<readonly [number, number]>,
  moves: Move[]
): void {
  const side = board.sideToMove;
  const r = squareRank(sq);
  const f = squareFile(sq);

  for (const [dr, df] of rays) {
    let nr = r + dr;
    let nf = f + df;
    while (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
      const to = squareIndex(nr, nf);
      const target = board.squares[to];
      if (target === EMPTY) {
        moves.push(createMove(sq, to, 0, 0));
      } else {
        if (pieceColor(target) !== side) {
          moves.push(createMove(sq, to, 0, FLAG_CAPTURE));
        }
        break;
      }
      nr += dr;
      nf += df;
    }
  }
}

const BISHOP_RAYS = [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const;
const ROOK_RAYS = [[0, 1], [0, -1], [1, 0], [-1, 0]] as const;

function genPawnMoves(board: BoardState, sq: number, moves: Move[]): void {
  const side = board.sideToMove;
  const rank = squareRank(sq);
  const file = squareFile(sq);
  const dir = side === WHITE ? 8 : -8;
  const startRank = side === WHITE ? 1 : 6;
  const promoRank = side === WHITE ? 7 : 0;

  // Single push
  const to1 = sq + dir;
  if (board.squares[to1] === EMPTY) {
    if (squareRank(to1) === promoRank) {
      for (const pr of [QUEEN, ROOK, BISHOP, KNIGHT]) moves.push(createMove(sq, to1, pr, 0));
    } else {
      moves.push(createMove(sq, to1, 0, 0));
    }
    // Double push
    if (rank === startRank) {
      const to2 = sq + 2 * dir;
      if (board.squares[to2] === EMPTY) {
        moves.push(createMove(sq, to2, 0, FLAG_DOUBLE_PUSH));
      }
    }
  }

  // Captures: offsets differ by side
  // White: sq+7=(rank+1,file-1), sq+9=(rank+1,file+1)
  // Black: sq-9=(rank-1,file-1), sq-7=(rank-1,file+1)
  const captureOffsets = side === WHITE ? [7, 9] : [-9, -7];
  const captureFileDelta = [-1, 1];

  for (let i = 0; i < 2; i++) {
    const cf = file + captureFileDelta[i];
    if (cf < 0 || cf >= 8) continue;
    const to = sq + captureOffsets[i];
    if (to < 0 || to >= 64) continue;

    const target = board.squares[to];
    if (target !== EMPTY && pieceColor(target) !== side) {
      if (squareRank(to) === promoRank) {
        for (const pr of [QUEEN, ROOK, BISHOP, KNIGHT]) moves.push(createMove(sq, to, pr, FLAG_CAPTURE));
      } else {
        moves.push(createMove(sq, to, 0, FLAG_CAPTURE));
      }
    } else if (to === board.enPassantSquare) {
      moves.push(createMove(sq, to, 0, FLAG_EN_PASSANT));
    }
  }
}

function genKnightMoves(board: BoardState, sq: number, moves: Move[]): void {
  const side = board.sideToMove;
  const r = squareRank(sq);
  const f = squareFile(sq);
  const deltas = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]] as const;
  for (const [dr, df] of deltas) {
    const nr = r + dr;
    const nf = f + df;
    if (nr < 0 || nr >= 8 || nf < 0 || nf >= 8) continue;
    const to = squareIndex(nr, nf);
    const target = board.squares[to];
    if (target === EMPTY || pieceColor(target) !== side) {
      moves.push(createMove(sq, to, 0, target !== EMPTY ? FLAG_CAPTURE : 0));
    }
  }
}

function genKingMoves(board: BoardState, sq: number, moves: Move[]): void {
  const side = board.sideToMove;
  const r = squareRank(sq);
  const f = squareFile(sq);

  for (let dr = -1; dr <= 1; dr++) {
    for (let df = -1; df <= 1; df++) {
      if (dr === 0 && df === 0) continue;
      const nr = r + dr;
      const nf = f + df;
      if (nr < 0 || nr >= 8 || nf < 0 || nf >= 8) continue;
      const to = squareIndex(nr, nf);
      const target = board.squares[to];
      if (target === EMPTY || pieceColor(target) !== side) {
        moves.push(createMove(sq, to, 0, target !== EMPTY ? FLAG_CAPTURE : 0));
      }
    }
  }

  // Castling
  if (side === WHITE) {
    if (sq === 4) {
      if (
        (board.castlingRights & CASTLE_WK) &&
        board.squares[5] === EMPTY &&
        board.squares[6] === EMPTY
      ) {
        moves.push(createMove(4, 6, 0, FLAG_CASTLE_KS));
      }
      if (
        (board.castlingRights & CASTLE_WQ) &&
        board.squares[1] === EMPTY &&
        board.squares[2] === EMPTY &&
        board.squares[3] === EMPTY
      ) {
        moves.push(createMove(4, 2, 0, FLAG_CASTLE_QS));
      }
    }
  } else {
    if (sq === 60) {
      if (
        (board.castlingRights & CASTLE_BK) &&
        board.squares[61] === EMPTY &&
        board.squares[62] === EMPTY
      ) {
        moves.push(createMove(60, 62, 0, FLAG_CASTLE_KS));
      }
      if (
        (board.castlingRights & CASTLE_BQ) &&
        board.squares[57] === EMPTY &&
        board.squares[58] === EMPTY &&
        board.squares[59] === EMPTY
      ) {
        moves.push(createMove(60, 58, 0, FLAG_CASTLE_QS));
      }
    }
  }
}

export function generatePseudoLegalMoves(board: BoardState): Move[] {
  const moves: Move[] = [];
  const side = board.sideToMove;

  for (let sq = 0; sq < 64; sq++) {
    const piece = board.squares[sq];
    if (piece === EMPTY || pieceColor(piece) !== side) continue;

    const pt = pieceType(piece);
    switch (pt) {
      case PAWN:   genPawnMoves(board, sq, moves); break;
      case KNIGHT: genKnightMoves(board, sq, moves); break;
      case BISHOP: addSlidingMoves(board, sq, BISHOP_RAYS, moves); break;
      case ROOK:   addSlidingMoves(board, sq, ROOK_RAYS, moves); break;
      case QUEEN:
        addSlidingMoves(board, sq, BISHOP_RAYS, moves);
        addSlidingMoves(board, sq, ROOK_RAYS, moves);
        break;
      case KING:   genKingMoves(board, sq, moves); break;
    }
  }

  return moves;
}

export function generateLegalMoves(board: BoardState): Move[] {
  const pseudoLegal = generatePseudoLegalMoves(board);
  const legal: Move[] = [];
  const side = board.sideToMove;
  const opp = 1 - side;

  for (const move of pseudoLegal) {
    // Pre-check castling legality (can't castle in check or through check)
    if (move.flags & (FLAG_CASTLE_KS | FLAG_CASTLE_QS)) {
      const kingStart = side === WHITE ? 4 : 60;
      if (isSquareAttacked(board, kingStart, opp)) continue;
      const passThrough = (move.flags & FLAG_CASTLE_KS) ? kingStart + 1 : kingStart - 1;
      if (isSquareAttacked(board, passThrough, opp)) continue;
    }

    makeMove(board, move);
    if (!isKingInCheck(board, side)) {
      legal.push(move);
    }
    unmakeMove(board, move);
  }

  return legal;
}

// ─── Perft ───────────────────────────────────────────────────────────────────

export function perft(board: BoardState, depth: number): number {
  if (depth === 0) return 1;
  const moves = generateLegalMoves(board);
  if (depth === 1) return moves.length;

  let nodes = 0;
  for (const move of moves) {
    makeMove(board, move);
    nodes += perft(board, depth - 1);
    unmakeMove(board, move);
  }
  return nodes;
}
