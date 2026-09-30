import { Difficulty } from "../game/types.ts";

/** Message sent from the UI to the engine worker to request a move. */
export interface SearchRequest {
  type: "search";
  requestId: number;
  fen: string;
  difficulty: Difficulty;
}

/** Successful reply carrying the chosen move as UCI. */
export interface SearchResponse {
  type: "result";
  requestId: number;
  uci: string | null;
  score: number;
  depth: number;
  nodes: number;
}

/** Error reply if the worker could not compute a move. */
export interface SearchError {
  type: "error";
  requestId: number;
  error: string;
}

export type EngineOutbound = SearchResponse | SearchError;
