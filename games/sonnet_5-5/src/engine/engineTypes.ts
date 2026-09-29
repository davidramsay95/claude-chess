export type Level = 'easy' | 'medium' | 'hard' | 'expert';

export const LEVELS: readonly Level[] = ['easy', 'medium', 'hard', 'expert'];

/** Message from the UI thread to the engine worker. */
export interface EngineRequest {
  id: number;
  /** FEN of the position the game started from. */
  startFen: string;
  /** Every move played since `startFen`, in coordinate notation (e.g. `e2e4`, `e7e8q`). */
  moves: string[];
  level: Level;
}

export interface EngineSearchInfo {
  depth: number;
  /** Score in centipawns from the side to move's perspective. */
  scoreCp: number;
  nodes: number;
  elapsedMs: number;
}

/** Message from the engine worker back to the UI thread. */
export interface EngineResponse {
  id: number;
  /** Best move in coordinate notation, or null if the side to move has no legal moves. */
  move: string | null;
  info?: EngineSearchInfo;
}
