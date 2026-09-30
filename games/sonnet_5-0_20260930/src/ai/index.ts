/**
 * Public API for the AI opponent. Phase 2 (via the Web Worker) should only
 * import from here.
 */

import { getLegalMoves } from "../engine/index";
import type { GameState, Move } from "../engine/types";
import { getDifficultyConfig } from "./difficulty";
import { iterativeDeepeningSearch } from "./search";

export type { Difficulty } from "./difficulty";
import type { Difficulty } from "./difficulty";

/** Default time budget, matching the ~5s-per-move UI requirement with margin. */
export const DEFAULT_TIME_LIMIT_MS = 4500;

/**
 * Finds the AI's move for `state` at the given `difficulty`. Synchronous by
 * design (see the module-level worker, which is what makes this
 * non-blocking from the UI's perspective). Uses iterative deepening bounded
 * by `timeLimitMs`, so it always returns well within that budget.
 *
 * Throws if `state` has no legal moves (i.e. the game has already ended);
 * callers (the worker's `handleWorkerRequest`) are expected to catch this.
 */
export function findBestMove(
  state: GameState,
  difficulty: Difficulty,
  timeLimitMs: number = DEFAULT_TIME_LIMIT_MS,
): Move {
  const legalMoves = getLegalMoves(state);
  if (legalMoves.length === 0) {
    throw new Error("No legal moves available: the game has already ended");
  }

  const config = getDifficultyConfig(difficulty);
  const result = iterativeDeepeningSearch(state, config, timeLimitMs);
  return result.move;
}
