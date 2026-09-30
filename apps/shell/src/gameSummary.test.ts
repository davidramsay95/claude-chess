import { describe, expect, it } from "vitest";
import { gameName } from "./gameSummary.ts";

describe("gameName", () => {
  it("drops the date suffix from the label", () => {
    expect(gameName({ slug: "opus_5-5_20260929", label: "Opus 5.5 (2026-09-29)", date: "2026-09-29" })).toBe("Opus 5.5");
  });

  it("keeps a label that has no date", () => {
    expect(gameName({ slug: "opus_5-5", label: "Opus 5.5", date: null })).toBe("Opus 5.5");
    expect(gameName({ slug: "opus_5-5", label: "Opus 5.5" })).toBe("Opus 5.5");
  });
});
