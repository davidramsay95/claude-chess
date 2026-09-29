import type { Difficulty } from "./search";

/** Asks the worker for a move. The position is `startFen` with each UCI move in `moves` applied. */
export interface SearchRequest {
  type: "search";
  id: number;
  startFen: string;
  moves: string[];
  difficulty: Difficulty;
}

export interface SearchResponse {
  type: "result";
  id: number;
  /** The chosen move in UCI notation, e.g. "e2e4" or "e7e8q". */
  move: string;
  score: number;
  depth: number;
  nodes: number;
  timeMs: number;
}

export interface SearchError {
  type: "error";
  id: number;
  message: string;
}

export type WorkerInbound = SearchRequest;
export type WorkerOutbound = SearchResponse | SearchError;
