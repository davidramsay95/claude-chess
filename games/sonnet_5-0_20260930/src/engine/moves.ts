import { fileOf, indexToSquare, positionKey, rankOf, squareToIndex } from "./board";
import type { CastlingRights, Color, GameState, Move, Piece, Square } from "./types";

/** A pseudo-legal or legal move expressed with board indices (0-63). */
interface InternalMove {
  from: number;
  to: number;
  promotion?: "q" | "r" | "b" | "n";
}

const KNIGHT_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];

const KING_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

const BISHOP_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const ROOK_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function opponent(color: Color): Color {
  return color === "white" ? "black" : "white";
}

function inBounds(file: number, rank: number): boolean {
  return file >= 0 && file <= 7 && rank >= 0 && rank <= 7;
}

/** True if `square` (index) is attacked by any piece of `byColor`. */
export function isSquareAttacked(
  board: readonly (Piece | null)[],
  square: number,
  byColor: Color,
): boolean {
  const file = fileOf(square);
  const rank = rankOf(square);

  // Pawns: a byColor pawn attacks diagonally "forward" from its own side.
  const pawnRankOffset = byColor === "white" ? -1 : 1;
  for (const fileOffset of [-1, 1]) {
    const f = file + fileOffset;
    const r = rank + pawnRankOffset;
    if (inBounds(f, r)) {
      const piece = board[r * 8 + f];
      if (piece && piece.color === byColor && piece.type === "p") return true;
    }
  }

  // Knights.
  for (const [df, dr] of KNIGHT_OFFSETS) {
    const f = file + df;
    const r = rank + dr;
    if (inBounds(f, r)) {
      const piece = board[r * 8 + f];
      if (piece && piece.color === byColor && piece.type === "n") return true;
    }
  }

  // King.
  for (const [df, dr] of KING_OFFSETS) {
    const f = file + df;
    const r = rank + dr;
    if (inBounds(f, r)) {
      const piece = board[r * 8 + f];
      if (piece && piece.color === byColor && piece.type === "k") return true;
    }
  }

  // Sliding: bishop/queen on diagonals.
  for (const [df, dr] of BISHOP_DIRECTIONS) {
    let f = file + df;
    let r = rank + dr;
    while (inBounds(f, r)) {
      const piece = board[r * 8 + f];
      if (piece) {
        if (piece.color === byColor && (piece.type === "b" || piece.type === "q")) return true;
        break;
      }
      f += df;
      r += dr;
    }
  }

  // Sliding: rook/queen on files/ranks.
  for (const [df, dr] of ROOK_DIRECTIONS) {
    let f = file + df;
    let r = rank + dr;
    while (inBounds(f, r)) {
      const piece = board[r * 8 + f];
      if (piece) {
        if (piece.color === byColor && (piece.type === "r" || piece.type === "q")) return true;
        break;
      }
      f += df;
      r += dr;
    }
  }

  return false;
}

function findKing(board: readonly (Piece | null)[], color: Color): number {
  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    if (piece && piece.color === color && piece.type === "k") return i;
  }
  throw new Error(`Invalid position: no ${color} king on the board`);
}

export function isInCheckAt(board: readonly (Piece | null)[], color: Color): boolean {
  const kingIndex = findKing(board, color);
  return isSquareAttacked(board, kingIndex, opponent(color));
}

function generatePseudoLegalMoves(state: GameState): InternalMove[] {
  const { board, turn } = state;
  const moves: InternalMove[] = [];
  const backRank = turn === "white" ? 0 : 7;

  for (let from = 0; from < 64; from++) {
    const piece = board[from];
    if (!piece || piece.color !== turn) continue;

    const file = fileOf(from);
    const rank = rankOf(from);

    switch (piece.type) {
      case "p": {
        const direction = turn === "white" ? 1 : -1;
        const startRank = turn === "white" ? 1 : 6;
        const promotionRank = turn === "white" ? 7 : 0;

        const oneStepRank = rank + direction;
        if (inBounds(file, oneStepRank) && !board[oneStepRank * 8 + file]) {
          const to = oneStepRank * 8 + file;
          addPawnMoves(moves, from, to, oneStepRank === promotionRank);

          const twoStepRank = rank + 2 * direction;
          if (rank === startRank && !board[twoStepRank * 8 + file]) {
            moves.push({ from, to: twoStepRank * 8 + file });
          }
        }

        for (const fileOffset of [-1, 1]) {
          const captureFile = file + fileOffset;
          const captureRank = rank + direction;
          if (!inBounds(captureFile, captureRank)) continue;
          const to = captureRank * 8 + captureFile;
          const target = board[to];
          const isEnPassant =
            state.enPassantTarget !== null && squareToIndex(state.enPassantTarget) === to;
          if ((target && target.color !== turn) || isEnPassant) {
            addPawnMoves(moves, from, to, captureRank === promotionRank);
          }
        }
        break;
      }
      case "n": {
        for (const [df, dr] of KNIGHT_OFFSETS) {
          const f = file + df;
          const r = rank + dr;
          if (!inBounds(f, r)) continue;
          const to = r * 8 + f;
          const target = board[to];
          if (!target || target.color !== turn) moves.push({ from, to });
        }
        break;
      }
      case "b":
        pushSlidingMoves(moves, board, from, BISHOP_DIRECTIONS, turn);
        break;
      case "r":
        pushSlidingMoves(moves, board, from, ROOK_DIRECTIONS, turn);
        break;
      case "q":
        pushSlidingMoves(moves, board, from, [...BISHOP_DIRECTIONS, ...ROOK_DIRECTIONS], turn);
        break;
      case "k": {
        for (const [df, dr] of KING_OFFSETS) {
          const f = file + df;
          const r = rank + dr;
          if (!inBounds(f, r)) continue;
          const to = r * 8 + f;
          const target = board[to];
          if (!target || target.color !== turn) moves.push({ from, to });
        }
        moves.push(...generateCastlingMoves(state, backRank));
        break;
      }
    }
  }

  return moves;
}

function addPawnMoves(moves: InternalMove[], from: number, to: number, isPromotion: boolean): void {
  if (isPromotion) {
    for (const promotion of ["q", "r", "b", "n"] as const) {
      moves.push({ from, to, promotion });
    }
  } else {
    moves.push({ from, to });
  }
}

function pushSlidingMoves(
  moves: InternalMove[],
  board: readonly (Piece | null)[],
  from: number,
  directions: ReadonlyArray<readonly [number, number]>,
  turn: Color,
): void {
  const file = fileOf(from);
  const rank = rankOf(from);
  for (const [df, dr] of directions) {
    let f = file + df;
    let r = rank + dr;
    while (inBounds(f, r)) {
      const to = r * 8 + f;
      const target = board[to];
      if (!target) {
        moves.push({ from, to });
      } else {
        if (target.color !== turn) moves.push({ from, to });
        break;
      }
      f += df;
      r += dr;
    }
  }
}

function generateCastlingMoves(state: GameState, backRank: number): InternalMove[] {
  const { board, turn, castlingRights } = state;
  const moves: InternalMove[] = [];
  const kingFrom = backRank * 8 + 4;
  const enemy = opponent(turn);

  const kingside = turn === "white" ? castlingRights.whiteKingside : castlingRights.blackKingside;
  const queenside =
    turn === "white" ? castlingRights.whiteQueenside : castlingRights.blackQueenside;

  if (isSquareAttacked(board, kingFrom, enemy)) {
    // Cannot castle out of check.
    return moves;
  }

  if (kingside) {
    const fSquare = backRank * 8 + 5;
    const gSquare = backRank * 8 + 6;
    const hSquare = backRank * 8 + 7;
    const rook = board[hSquare];
    if (
      rook &&
      rook.type === "r" &&
      rook.color === turn &&
      !board[fSquare] &&
      !board[gSquare] &&
      !isSquareAttacked(board, fSquare, enemy) &&
      !isSquareAttacked(board, gSquare, enemy)
    ) {
      moves.push({ from: kingFrom, to: gSquare });
    }
  }

  if (queenside) {
    const dSquare = backRank * 8 + 3;
    const cSquare = backRank * 8 + 2;
    const bSquare = backRank * 8 + 1;
    const aSquare = backRank * 8 + 0;
    const rook = board[aSquare];
    if (
      rook &&
      rook.type === "r" &&
      rook.color === turn &&
      !board[dSquare] &&
      !board[cSquare] &&
      !board[bSquare] &&
      !isSquareAttacked(board, dSquare, enemy) &&
      !isSquareAttacked(board, cSquare, enemy)
    ) {
      moves.push({ from: kingFrom, to: cSquare });
    }
  }

  return moves;
}

function revokeCastlingRightsForSquare(
  rights: CastlingRights,
  square: number,
): CastlingRights {
  switch (square) {
    case 4: // e1
      return { ...rights, whiteKingside: false, whiteQueenside: false };
    case 60: // e8
      return { ...rights, blackKingside: false, blackQueenside: false };
    case 0: // a1
      return { ...rights, whiteQueenside: false };
    case 7: // h1
      return { ...rights, whiteKingside: false };
    case 56: // a8
      return { ...rights, blackQueenside: false };
    case 63: // h8
      return { ...rights, blackKingside: false };
    default:
      return rights;
  }
}

export interface ApplyMoveResult {
  state: GameState;
  isCapture: boolean;
  isCastle: boolean;
  isEnPassant: boolean;
  movedPiece: Piece;
  capturedPiece: Piece | null;
}

/**
 * Applies a pseudo-legal `InternalMove` to `state`, producing a brand new
 * `GameState`. Does not itself check whether the move is legal (i.e. whether
 * it leaves the mover's own king in check) — that is handled by the callers
 * in this module and in `rules.ts`, since legality-checking needs to try a
 * move and then inspect the resulting position anyway.
 */
function applyInternalMove(state: GameState, move: InternalMove): ApplyMoveResult {
  const board = state.board.slice();
  const piece = board[move.from];
  if (!piece) {
    throw new Error(`Invalid move: no piece on square ${indexToSquare(move.from)}`);
  }

  const backRank = piece.color === "white" ? 0 : 7;
  const isCastle =
    piece.type === "k" && Math.abs(fileOf(move.to) - fileOf(move.from)) === 2;
  const isEnPassant =
    piece.type === "p" &&
    fileOf(move.to) !== fileOf(move.from) &&
    board[move.to] === null;

  let capturedPiece: Piece | null = board[move.to];
  let castlingRights = state.castlingRights;

  board[move.from] = null;

  if (isEnPassant) {
    const capturedPawnSquare = rankOf(move.from) * 8 + fileOf(move.to);
    capturedPiece = board[capturedPawnSquare];
    board[capturedPawnSquare] = null;
  }

  const promotedPiece: Piece = move.promotion
    ? { type: move.promotion, color: piece.color }
    : piece;
  board[move.to] = promotedPiece;

  if (isCastle) {
    const isKingside = fileOf(move.to) === 6;
    const rookFrom = backRank * 8 + (isKingside ? 7 : 0);
    const rookTo = backRank * 8 + (isKingside ? 5 : 3);
    board[rookTo] = board[rookFrom];
    board[rookFrom] = null;
  }

  castlingRights = revokeCastlingRightsForSquare(castlingRights, move.from);
  castlingRights = revokeCastlingRightsForSquare(castlingRights, move.to);

  let enPassantTarget: Square | null = null;
  if (piece.type === "p" && Math.abs(rankOf(move.to) - rankOf(move.from)) === 2) {
    const passedRank = (rankOf(move.from) + rankOf(move.to)) / 2;
    enPassantTarget = indexToSquare(passedRank * 8 + fileOf(move.from));
  }

  const isPawnMoveOrCapture = piece.type === "p" || capturedPiece !== null;
  const halfmoveClock = isPawnMoveOrCapture ? 0 : state.halfmoveClock + 1;
  const turn = opponent(state.turn);
  const fullmoveNumber = state.turn === "black" ? state.fullmoveNumber + 1 : state.fullmoveNumber;

  const key = positionKey(board, turn, castlingRights, enPassantTarget);

  const newState: GameState = {
    board,
    turn,
    castlingRights,
    enPassantTarget,
    halfmoveClock,
    fullmoveNumber,
    positionHistory: [...state.positionHistory, key],
  };

  return {
    state: newState,
    isCapture: capturedPiece !== null,
    isCastle,
    isEnPassant,
    movedPiece: piece,
    capturedPiece,
  };
}

/** All fully legal moves for `state.turn`, in algebraic `Move` form. */
export function getLegalMoves(state: GameState): Move[] {
  const pseudoLegal = generatePseudoLegalMoves(state);
  const legal: Move[] = [];

  for (const candidate of pseudoLegal) {
    const { state: resultState } = applyInternalMove(state, candidate);
    if (!isInCheckAt(resultState.board, state.turn)) {
      legal.push({
        from: indexToSquare(candidate.from),
        to: indexToSquare(candidate.to),
        ...(candidate.promotion ? { promotion: candidate.promotion } : {}),
      });
    }
  }

  return legal;
}

/**
 * Finds the legal-move candidate matching `move` (by from/to/promotion) and
 * applies it. Returns `null` if `move` is not legal in `state`.
 */
export function tryApplyMove(state: GameState, move: Move): ApplyMoveResult | null {
  let fromIndex: number;
  let toIndex: number;
  try {
    if (!isSquareInBounds(move.from) || !isSquareInBounds(move.to)) return null;
    fromIndex = squareToIndex(move.from);
    toIndex = squareToIndex(move.to);
  } catch {
    return null;
  }

  const pseudoLegal = generatePseudoLegalMoves(state);
  const match = pseudoLegal.find(
    (candidate) =>
      candidate.from === fromIndex &&
      candidate.to === toIndex &&
      candidate.promotion === move.promotion,
  );
  if (!match) return null;

  const result = applyInternalMove(state, match);
  if (isInCheckAt(result.state.board, state.turn)) return null;
  return result;
}

function isSquareInBounds(square: string): boolean {
  if (square.length !== 2) return false;
  const file = square.charCodeAt(0) - "a".charCodeAt(0);
  const rank = square.charCodeAt(1) - "1".charCodeAt(0);
  return file >= 0 && file <= 7 && rank >= 0 && rank <= 7;
}
