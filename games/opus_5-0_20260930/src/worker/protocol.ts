import type { Difficulty } from "../engine/difficulty.ts";

export interface ThinkRequest {
  type: "think";
  id: number;
  startFen: string;
  moves: string[];
  difficulty: Difficulty;
}

export interface MoveResponse {
  type: "move";
  id: number;
  uci: string;
  score: number;
  depth: number;
  nodes: number;
  timeMs: number;
  pv: string[];
}

export interface ErrorResponse {
  type: "error";
  id: number;
  message: string;
}

export type EngineResponse = MoveResponse | ErrorResponse;

/**
 * Replays a request into a result. Shared by the worker and by the main-thread
 * fallback used when a browser refuses to construct the worker.
 */
export async function answer(
  request: ThinkRequest,
  runner: (request: ThinkRequest) => MoveResponse,
): Promise<EngineResponse> {
  try {
    return runner(request);
  } catch (error) {
    return {
      type: "error",
      id: request.id,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
