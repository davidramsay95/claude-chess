import { Game } from "../engine/game.ts";
import { createSearcher } from "../engine/search.ts";
import type { MoveResponse, ThinkRequest } from "./protocol.ts";

const searcher = createSearcher();

/** Rebuilds the game from its move list, then searches. */
export function think(request: ThinkRequest): MoveResponse {
  const game = new Game(request.startFen);
  for (const uci of request.moves) game.playUci(uci);
  const result = searcher.think(game, request.difficulty);
  return {
    type: "move",
    id: request.id,
    uci: result.uci,
    score: result.score,
    depth: result.depth,
    nodes: result.nodes,
    timeMs: result.timeMs,
    pv: result.pv,
  };
}
