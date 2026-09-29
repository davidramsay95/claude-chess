import { Game } from "./game";
import type { SearchResponse, WorkerInbound } from "./protocol";
import { findBestMove } from "./search";

/** Engine worker: replays the game, searches, and posts the reply. No DOM access here. */
const replay = (startFen: string, moves: string[]): Game => {
  const game = Game.fromFen(startFen);
  moves.forEach((uci, index) => {
    if (!game.playUci(uci)) throw new Error(`Move ${index + 1} (${uci}) is not legal`);
  });
  return game;
};

self.onmessage = (event: MessageEvent<WorkerInbound>): void => {
  const request = event.data;
  if (!request || request.type !== "search") return;
  const started = performance.now();
  let response: SearchResponse;
  try {
    const game = replay(request.startFen, request.moves);
    const result = findBestMove(game, { difficulty: request.difficulty });
    response = {
      type: "result",
      id: request.id,
      uci: result.uci,
      depth: result.depth,
      score: result.score,
      nodes: result.nodes,
      timeMs: result.timeMs,
    };
  } catch (error) {
    console.error("Engine search failed", error);
    response = {
      type: "result",
      id: request.id,
      uci: null,
      depth: 0,
      score: 0,
      nodes: 0,
      timeMs: Math.round(performance.now() - started),
    };
  }
  self.postMessage(response);
};
