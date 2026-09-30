import { parseFen, moveToUci, uciToMove, makeMove } from "../engine/board.js";
import { findBestMove } from "../engine/search.js";

export interface WorkerRequest {
  type: "getBestMove";
  fen: string;
  previousFens: string[];
  difficulty: string;
}

export interface WorkerResponse {
  type: "bestMove";
  uci: string | null;
}

self.addEventListener("message", (e: MessageEvent<WorkerRequest>) => {
  if (e.data.type !== "getBestMove") return;

  const { fen, previousFens, difficulty } = e.data;
  const board = parseFen(fen);

  // Build position count map for repetition detection
  const positionCounts = new Map<string, number>();
  for (const f of previousFens) {
    positionCounts.set(f, (positionCounts.get(f) ?? 0) + 1);
  }

  const result = findBestMove(board, difficulty, positionCounts, 4500);
  const uci = result.move ? moveToUci(result.move) : null;

  const response: WorkerResponse = { type: "bestMove", uci };
  self.postMessage(response);
});
