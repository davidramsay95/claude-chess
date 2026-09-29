import { chooseMove } from "./search";
import type { SearchRequest, SearchResponse } from "./protocol";

self.onmessage = (event: MessageEvent<SearchRequest>): void => {
  const { id, startFen, moves, difficulty } = event.data;
  let response: SearchResponse;
  try {
    const outcome = chooseMove(startFen, moves, difficulty);
    response = { id, ...outcome };
  } catch {
    // A corrupt history must not leave the page waiting forever; report "no move".
    response = { id, move: null, depth: 0, score: 0, nodes: 0 };
  }
  self.postMessage(response);
};
