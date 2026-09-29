import { describe, expect, it } from "vitest";
import { toMovePairs } from "./moveList";

describe("toMovePairs", () => {
  it("returns nothing before the first move", () => {
    expect(toMovePairs([])).toEqual([]);
  });

  it("groups SAN moves into numbered White and Black pairs", () => {
    expect(toMovePairs(["e4", "e5", "Nf3", "Nc6", "Bb5"])).toEqual([
      { number: 1, white: "e4", black: "e5" },
      { number: 2, white: "Nf3", black: "Nc6" },
      { number: 3, white: "Bb5" },
    ]);
  });
});
