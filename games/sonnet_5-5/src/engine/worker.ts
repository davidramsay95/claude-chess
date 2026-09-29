/// <reference lib="webworker" />
import type { EngineRequest, EngineResponse } from './engineTypes';
import { Game } from './game';
import { chooseMove } from './levels';
import { START_FEN } from './position';
import { clearTranspositionTable } from './search';
import { moveToUci } from './types';

/** Repetition history needs the real move list, so the game is replayed from the start FEN. */
const rebuildGame = (request: EngineRequest, lenient = false): Game => {
  const game = Game.fromFen(request.startFen);
  for (const uci of request.moves) {
    const move = game.parseUci(uci);
    if (move !== undefined) game.play(move);
    else if (!lenient) throw new Error(`Illegal move in history: ${uci}`);
  }
  return game;
};

const isStandardStart = (fen: string): boolean =>
  fen.trim().split(/\s+/).slice(0, 4).join(' ') === START_FEN.split(' ').slice(0, 4).join(' ');

const respond = (request: EngineRequest): EngineResponse => {
  const game = rebuildGame(request);
  if (request.moves.length === 0) clearTranspositionTable();
  const result = chooseMove(game.position, request.level, {
    uciHistory: isStandardStart(request.startFen) ? request.moves : null,
  });
  return {
    id: request.id,
    move: result.move === undefined ? null : moveToUci(result.move),
    info: {
      depth: result.depth,
      scoreCp: result.scoreCp,
      nodes: result.nodes,
      elapsedMs: result.elapsedMs,
    },
  };
};

/** Last resort when the search throws: any legal move beats a hung UI. */
const fallbackResponse = (request: EngineRequest, error: unknown): EngineResponse => {
  console.error('engine search failed', error);
  try {
    const legal = rebuildGame(request, true).legalMoves();
    return { id: request.id, move: legal.length ? moveToUci(legal[0]) : null };
  } catch (fallbackError) {
    console.error('engine fallback failed', fallbackError);
    return { id: request.id, move: null };
  }
};

self.onmessage = (event: MessageEvent<EngineRequest>): void => {
  const request = event.data;
  let response: EngineResponse;
  try {
    response = respond(request);
  } catch (error) {
    response = fallbackResponse(request, error);
  }
  self.postMessage(response);
};
