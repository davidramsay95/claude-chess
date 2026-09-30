import { search } from "./search.js";
import { ChessGame } from "../chess/game.js";
import type { Difficulty } from "../chess/types.js";
import { moveToUci } from "../chess/types.js";

interface WorkerMessage {
  type: "search";
  fen: string;
  difficulty: Difficulty;
}

interface WorkerResponse {
  type: "result";
  bestMove: string;
  score: number;
  depth: number;
  nodes: number;
}

self.onmessage = (e: MessageEvent<WorkerMessage>): void => {
  const { type, fen, difficulty } = e.data;

  if (type === "search") {
    const game = new ChessGame(fen);
    const result = search(game, difficulty);

    const response: WorkerResponse = {
      type: "result",
      bestMove: moveToUci(result.bestMove),
      score: result.score,
      depth: result.depth,
      nodes: result.nodes,
    };

    self.postMessage(response);
  }
};
