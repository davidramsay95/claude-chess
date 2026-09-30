import { describe, expect, it } from "vitest";
import { getDifficultyConfig, type Difficulty } from "../difficulty";

describe("difficulty configuration", () => {
  const order: Difficulty[] = ["easy", "medium", "hard", "expert"];

  it("strictly increases search depth with difficulty", () => {
    const depths = order.map((d) => getDifficultyConfig(d).maxDepth);
    for (let i = 1; i < depths.length; i++) {
      expect(depths[i]).toBeGreaterThan(depths[i - 1]);
    }
  });

  it("enables quiescence search only from hard upward", () => {
    expect(getDifficultyConfig("easy").useQuiescence).toBe(false);
    expect(getDifficultyConfig("medium").useQuiescence).toBe(false);
    expect(getDifficultyConfig("hard").useQuiescence).toBe(true);
    expect(getDifficultyConfig("expert").useQuiescence).toBe(true);
  });

  it("reduces move randomness as difficulty increases", () => {
    const randomness = order.map((d) => getDifficultyConfig(d).topMoveRandomness);
    for (let i = 1; i < randomness.length; i++) {
      expect(randomness[i]).toBeLessThanOrEqual(randomness[i - 1]);
    }
    expect(getDifficultyConfig("expert").topMoveRandomness).toBe(1);
  });
});
