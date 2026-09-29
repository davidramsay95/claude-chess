import type { Difficulty } from "../state";

/** Sent from the page to the search worker. */
export interface SearchRequest {
  id: number;
  startFen: string;
  moves: string[];
  difficulty: Difficulty;
}

/** Sent from the search worker back to the page. `move` is null only when there is no legal move. */
export interface SearchResponse {
  id: number;
  move: string | null;
  depth: number;
  score: number;
  nodes: number;
}
