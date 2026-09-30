/// <reference lib="webworker" />
import { parseFen } from "./engine/fen.js";
import { chooseMove, Difficulty } from "./engine/search.js";
import { uciOfMove } from "./engine/moves.js";

export interface WorkerRequest {
  id: number;
  fen: string;
  difficulty: Difficulty;
}
export interface WorkerResponse {
  id: number;
  uci: string;
  score: number;
  depth: number;
  nodes: number;
  timeMs: number;
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    const pos = parseFen(req.fen);
    const r = chooseMove(pos, req.difficulty);
    const resp: WorkerResponse = {
      id: req.id,
      uci: uciOfMove(r.move),
      score: r.score,
      depth: r.depth,
      nodes: r.nodes,
      timeMs: r.timeMs,
    };
    (self as unknown as { postMessage: (m: unknown) => void }).postMessage(resp);
  } catch (err) {
    (self as unknown as { postMessage: (m: unknown) => void }).postMessage({ id: req.id, error: String(err) });
  }
};
