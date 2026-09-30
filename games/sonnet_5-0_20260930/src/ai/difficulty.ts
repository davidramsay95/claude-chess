export type Difficulty = "easy" | "medium" | "hard" | "expert";

export interface DifficultyConfig {
  /** Maximum search depth (plies) the iterative-deepening loop will attempt. */
  maxDepth: number;
  /** Whether to extend captures at leaf nodes with a quiescence search. */
  useQuiescence: boolean;
  /**
   * Number of top-ranked root moves (by shallow search score) to randomly
   * choose among, to make weaker levels less deterministic and occasionally
   * let a non-optimal ("blunder-ish") move through. 1 means always play the
   * single best move found.
   */
  topMoveRandomness: number;
}

/**
 * Maps each public difficulty level to concrete search parameters.
 *
 * Depth strictly increases with difficulty (see `ai/__tests__/difficulty.test.ts`)
 * so the levels are measurably distinct even before accounting for
 * quiescence search and move-ordering quality, which further widen the gap
 * between `hard`/`expert` and the lower tiers.
 */
export function getDifficultyConfig(difficulty: Difficulty): DifficultyConfig {
  switch (difficulty) {
    case "easy":
      return { maxDepth: 2, useQuiescence: false, topMoveRandomness: 3 };
    case "medium":
      return { maxDepth: 3, useQuiescence: false, topMoveRandomness: 2 };
    case "hard":
      return { maxDepth: 4, useQuiescence: true, topMoveRandomness: 1 };
    case "expert":
      return { maxDepth: 6, useQuiescence: true, topMoveRandomness: 1 };
  }
}
