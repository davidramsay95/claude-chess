export type Difficulty = "easy" | "medium" | "hard" | "expert";

export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard", "expert"];

/** What the UI asks the engine: the game so far, so the search can see repetitions. */
export interface MoveRequest {
  startFen: string;
  /** Moves played from `startFen`, in UCI notation. */
  moves: readonly string[];
  difficulty: Difficulty;
}

export interface EngineRequest extends MoveRequest {
  id: number;
}

export type EngineResponse = { id: number; ok: true; move: string } | { id: number; ok: false; error: string };
