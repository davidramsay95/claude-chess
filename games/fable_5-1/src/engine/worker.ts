import { Position } from "./position";
import { moveToUci, uciToMove } from "./move";
import { findBestMove } from "./search";
import type { SearchRequest, WorkerInbound, WorkerOutbound } from "./protocol";

/** Rebuilds the game from its history and runs the search; never throws. */
export const handleSearchRequest = (request: SearchRequest): WorkerOutbound => {
  try {
    const pos = Position.fromFen(request.startFen);
    for (const uci of request.moves) {
      const move = uciToMove(pos, uci);
      if (move === null) throw new Error(`Illegal move in history: ${uci}`);
      pos.makeMove(move);
    }
    const result = findBestMove(pos, request.difficulty);
    return {
      type: "result",
      id: request.id,
      move: moveToUci(result.move),
      score: result.score,
      depth: result.depth,
      nodes: result.nodes,
      timeMs: result.timeMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { type: "error", id: request.id, message };
  }
};

// The handler above is unit-tested in Node, where no worker scope exists.
if (typeof self !== "undefined") {
  self.onmessage = (event: MessageEvent<WorkerInbound>): void => {
    self.postMessage(handleSearchRequest(event.data));
  };
}
