/// <reference lib="webworker" />
import { Board } from "../engine/board.ts";
import { moveToUci } from "../engine/notation.ts";
import { chooseMove, DIFFICULTY_LIMITS } from "../engine/search.ts";
import { EngineOutbound, SearchRequest } from "./protocol.ts";

// The engine runs entirely off the main thread so searching never blocks the UI.
self.onmessage = (event: MessageEvent<SearchRequest>): void => {
  const request = event.data;
  if (!request || request.type !== "search") return;

  try {
    const board = Board.fromFen(request.fen);
    const limits = DIFFICULTY_LIMITS[request.difficulty] ?? DIFFICULTY_LIMITS.medium;
    const result = chooseMove(board, limits);
    const response: EngineOutbound = {
      type: "result",
      requestId: request.requestId,
      uci: result.bestMove ? moveToUci(result.bestMove) : null,
      score: result.score,
      depth: result.depth,
      nodes: result.nodes,
    };
    (self as unknown as Worker).postMessage(response);
  } catch (err) {
    const response: EngineOutbound = {
      type: "error",
      requestId: request.requestId,
      error: err instanceof Error ? err.message : "Engine failure",
    };
    (self as unknown as Worker).postMessage(response);
  }
};
