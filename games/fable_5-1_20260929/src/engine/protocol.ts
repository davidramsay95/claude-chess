/** Messages between the interface and the engine worker. */

export type Difficulty = "easy" | "medium" | "hard" | "expert";

export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard", "expert"];

export const isDifficulty = (value: unknown): value is Difficulty =>
  typeof value === "string" && (DIFFICULTIES as readonly string[]).includes(value);

export interface SearchRequest {
  type: "search";
  id: number;
  /** FEN the game started from; the worker replays `moves` on top of it. */
  startFen: string;
  /** UCI moves played so far, so the engine sees repetitions. */
  moves: string[];
  difficulty: Difficulty;
}

export interface SearchResponse {
  type: "result";
  id: number;
  /** Best move in UCI, or null when the side to move has no legal move. */
  uci: string | null;
  depth: number;
  /** Centipawns from the engine's point of view; mates are +-(100000 - plies). */
  score: number;
  nodes: number;
  timeMs: number;
}

export type WorkerInbound = SearchRequest;
export type WorkerOutbound = SearchResponse;
