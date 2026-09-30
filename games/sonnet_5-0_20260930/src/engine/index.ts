/**
 * Public API for the chess rules engine. This is the only module Phase 2
 * (and the AI/worker layers) should import from — internal modules
 * (`board.ts`, `moves.ts`, `rules.ts`, `notation.ts`) may change shape as
 * long as these exports keep their signatures.
 */

import { createStartingState, parseFen, toFen as serializeToFen } from "./board";
import { moveToSan, moveToUci as moveToUciImpl, uciToMove as uciToMoveImpl } from "./notation";
import { tryApplyMove } from "./moves";
import { getStatus as computeStatus, getWinner as computeWinner, isInCheck as computeIsInCheck } from "./rules";
import { perft as perftImpl } from "./perft";
import { getLegalMoves as computeLegalMoves } from "./moves";

export type {
  Color,
  PieceType,
  Square,
  Piece,
  Move,
  GameStatus,
  GameState,
  CastlingRights,
} from "./types";
import type { Color, GameState, GameStatus, Move } from "./types";

/** Creates a new game, defaulting to the standard starting position. */
export function createGame(startFen?: string): GameState {
  return startFen ? parseFen(startFen) : createStartingState();
}

/** All fully legal moves available to the side to move. */
export function getLegalMoves(state: GameState): Move[] {
  return computeLegalMoves(state);
}

/**
 * Attempts to play `move` against `state`. Returns `null` (never throws) if
 * the move is illegal. On success, returns the new state — `state` itself
 * is never mutated, so callers can safely keep references to prior states
 * (e.g. to replay a game for import, or to support "undo").
 */
export function makeMove(
  state: GameState,
  move: Move,
): { state: GameState; san?: string; isCapture: boolean } | null {
  const result = tryApplyMove(state, move);
  if (!result) return null;

  const san = moveToSan(state, move, result.movedPiece, result.isCapture, result.state);

  return {
    state: result.state,
    san,
    isCapture: result.isCapture,
  };
}

export function getStatus(state: GameState): GameStatus {
  return computeStatus(state);
}

export function getWinner(state: GameState): Color | null {
  return computeWinner(state);
}

export function isInCheck(state: GameState, color: Color): boolean {
  return computeIsInCheck(state, color);
}

export function toFen(state: GameState): string {
  return serializeToFen(state);
}

export function moveToUci(move: Move): string {
  return moveToUciImpl(move);
}

export function uciToMove(state: GameState, uci: string): Move | null {
  return uciToMoveImpl(state, uci);
}

export function perft(state: GameState, depth: number): number {
  return perftImpl(state, depth);
}
