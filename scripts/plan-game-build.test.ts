import { describe, expect, it } from "vitest";
import { planGameBuild } from "./plan-game-build.ts";

describe("planGameBuild", () => {
  it("passes the sub-path base flag to Vite games and reads output from dist", () => {
    const plan = planGameBuild("fable_5-1", { devDependencies: { vite: "^8.3.0" } });
    expect(plan).toEqual({
      buildArgs: ["run", "build", "--", "--base=/play/fable_5-1/"],
      env: {},
      outputDirectory: "dist",
    });
  });

  it("passes the sub-path through the environment to Next.js games and reads output from out", () => {
    const plan = planGameBuild("opus_5-5", { dependencies: { next: "16.3.6" } });
    expect(plan).toEqual({
      buildArgs: ["run", "build"],
      env: { NEXT_BASE_PATH: "/play/opus_5-5" },
      outputDirectory: "out",
    });
  });

  it("throws a descriptive error for frameworks it does not recognise", () => {
    expect(() => planGameBuild("mystery_1-0", { dependencies: {} })).toThrow(
      /mystery_1-0.*neither vite nor next/i,
    );
  });
});
