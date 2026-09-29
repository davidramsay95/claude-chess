import { BISHOP_DIRS, KING_TARGETS, KNIGHT_TARGETS, RAYS, ROOK_DIRS } from './attacks';
import type { Position } from './position';
import {
  BISHOP,

  CASTLE_BK,
  CASTLE_BQ,
  CASTLE_WK,
  CASTLE_WQ,
  type Color,
  EMPTY,
  FLAG_CAPTURE,
  FLAG_CASTLE,
  FLAG_DOUBLE_PUSH,
  FLAG_EN_PASSANT,
  KING,
  KNIGHT,
  type Move,
  PAWN,
  QUEEN,
  ROOK,
  WHITE,
  encodeMove,
  pieceColor,
  pieceKind,
} from './types';

const PROMOTION_KINDS = [QUEEN, ROOK, BISHOP, KNIGHT] as const;

const pushPawnMove = (moves: Move[], from: number, to: number, flags: number, lastRank: boolean): void => {
  if (lastRank) {
    for (const kind of PROMOTION_KINDS) moves.push(encodeMove(from, to, kind, flags));
  } else {
    moves.push(encodeMove(from, to, 0, flags));
  }
};

const generatePawnMoves = (pos: Position, from: number, us: Color, moves: Move[], capturesOnly: boolean): void => {
  const board = pos.board;
  const forward = us === WHITE ? 8 : -8;
  const startRank = us === WHITE ? 1 : 6;
  const lastRank = us === WHITE ? 7 : 0;
  const file = from & 7;
  const rank = from >> 3;
  const promotes = rank + (us === WHITE ? 1 : -1) === lastRank;

  const one = from + forward;
  if (board[one] === EMPTY) {
    if (!capturesOnly || promotes) {
      pushPawnMove(moves, from, one, 0, promotes);
      if (!capturesOnly && rank === startRank && board[one + forward] === EMPTY) {
        moves.push(encodeMove(from, one + forward, 0, FLAG_DOUBLE_PUSH));
      }
    }
  }

  for (const df of [-1, 1]) {
    const targetFile = file + df;
    if (targetFile < 0 || targetFile > 7) continue;
    const to = one + df;
    const target = board[to];
    if (target !== EMPTY && pieceColor(target) !== us) {
      pushPawnMove(moves, from, to, FLAG_CAPTURE, promotes);
    } else if (to === pos.epSquare) {
      moves.push(encodeMove(from, to, 0, FLAG_CAPTURE | FLAG_EN_PASSANT));
    }
  }
};

const generateSliderMoves = (
  pos: Position,
  from: number,
  us: Color,
  dirs: ReadonlyArray<number>,
  moves: Move[],
  capturesOnly: boolean,
): void => {
  const board = pos.board;
  for (const dir of dirs) {
    for (const to of RAYS[from][dir]) {
      const target = board[to];
      if (target === EMPTY) {
        if (!capturesOnly) moves.push(encodeMove(from, to));
        continue;
      }
      if (pieceColor(target) !== us) moves.push(encodeMove(from, to, 0, FLAG_CAPTURE));
      break;
    }
  }
};

const generateJumpMoves = (
  pos: Position,
  from: number,
  us: Color,
  targets: Int8Array,
  moves: Move[],
  capturesOnly: boolean,
): void => {
  const board = pos.board;
  for (const to of targets) {
    const target = board[to];
    if (target === EMPTY) {
      if (!capturesOnly) moves.push(encodeMove(from, to));
    } else if (pieceColor(target) !== us) {
      moves.push(encodeMove(from, to, 0, FLAG_CAPTURE));
    }
  }
};

const generateCastlingMoves = (pos: Position, us: Color, moves: Move[]): void => {
  const board = pos.board;
  const them = (us ^ 1) as Color;
  const home = us === WHITE ? 4 : 60;
  const kingSideRight = us === WHITE ? CASTLE_WK : CASTLE_BK;
  const queenSideRight = us === WHITE ? CASTLE_WQ : CASTLE_BQ;
  if (!(pos.castling & (kingSideRight | queenSideRight))) return;
  if (pos.isAttacked(home, them)) return;

  if (
    pos.castling & kingSideRight &&
    board[home + 1] === EMPTY &&
    board[home + 2] === EMPTY &&
    !pos.isAttacked(home + 1, them) &&
    !pos.isAttacked(home + 2, them)
  ) {
    moves.push(encodeMove(home, home + 2, 0, FLAG_CASTLE));
  }
  if (
    pos.castling & queenSideRight &&
    board[home - 1] === EMPTY &&
    board[home - 2] === EMPTY &&
    board[home - 3] === EMPTY &&
    !pos.isAttacked(home - 1, them) &&
    !pos.isAttacked(home - 2, them)
  ) {
    moves.push(encodeMove(home, home - 2, 0, FLAG_CASTLE));
  }
};

/** Moves that obey piece movement but may leave the own king in check. */
export const generatePseudoLegalMoves = (pos: Position, capturesOnly = false): Move[] => {
  const moves: Move[] = [];
  const us = pos.turn;
  const board = pos.board;
  for (let from = 0; from < 64; from++) {
    const piece = board[from];
    if (piece === EMPTY || pieceColor(piece) !== us) continue;
    switch (pieceKind(piece)) {
      case PAWN:
        generatePawnMoves(pos, from, us, moves, capturesOnly);
        break;
      case KNIGHT:
        generateJumpMoves(pos, from, us, KNIGHT_TARGETS[from], moves, capturesOnly);
        break;
      case BISHOP:
        generateSliderMoves(pos, from, us, BISHOP_DIRS, moves, capturesOnly);
        break;
      case ROOK:
        generateSliderMoves(pos, from, us, ROOK_DIRS, moves, capturesOnly);
        break;
      case QUEEN:
        generateSliderMoves(pos, from, us, ROOK_DIRS, moves, capturesOnly);
        generateSliderMoves(pos, from, us, BISHOP_DIRS, moves, capturesOnly);
        break;
      case KING:
        generateJumpMoves(pos, from, us, KING_TARGETS[from], moves, capturesOnly);
        break;
    }
  }
  if (!capturesOnly) generateCastlingMoves(pos, us, moves);
  return moves;
};

/** Keeps only moves that do not leave the mover's king attacked. */
export const filterLegal = (pos: Position, pseudo: Move[]): Move[] => {
  const us = pos.turn;
  const legal: Move[] = [];
  for (const move of pseudo) {
    pos.makeMove(move);
    if (!pos.inCheck(us)) legal.push(move);
    pos.unmakeMove();
  }
  return legal;
};

export const generateLegalMoves = (pos: Position): Move[] =>
  filterLegal(pos, generatePseudoLegalMoves(pos));

