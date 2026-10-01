import { describe, expect, it } from "vitest";
import { parseGameFolderName, discoverGames, RELEASE_DATES } from "./discover-games.ts";

describe("parseGameFolderName", () => {
  it("parses model, version and subversion from the folder name", () => {
    expect(parseGameFolderName("fable_5-1", {})).toEqual({
      slug: "fable_5-1",
      model: "fable",
      version: "5",
      subversion: "1",
      label: "Fable 5.1",
      date: null,
      builtOn: null,
    });
  });

  it("keeps the folder date separate from the release date, and shows only the release date in the label", () => {
    expect(parseGameFolderName("haiku_4-5_20260930")).toEqual({
      slug: "haiku_4-5_20260930",
      model: "haiku",
      version: "4",
      subversion: "5",
      label: "Haiku 4.5 (2025-10-15)",
      date: "2025-10-15",
      builtOn: "2026-09-30",
    });
  });

  it("has no release date when the model is not in the release table", () => {
    expect(parseGameFolderName("fable_5-1_20260929", {})).toMatchObject({ label: "Fable 5.1", date: null, builtOn: "2026-09-29" });
  });

  it("rejects a date suffix that is not a real calendar date", () => {
    expect(parseGameFolderName("fable_5-1_20261399")).toBeNull();
    expect(parseGameFolderName("fable_5-1_20260230")).toBeNull();
    expect(parseGameFolderName("fable_5-1_2026929")).toBeNull();
  });

  it("returns null for folders that do not follow the naming format", () => {
    expect(parseGameFolderName("node_modules")).toBeNull();
    expect(parseGameFolderName("opus_5")).toBeNull();
    expect(parseGameFolderName("Opus_5-5")).toBeNull();
    expect(parseGameFolderName("opus_5-5-1")).toBeNull();
  });

  it("only lists real calendar dates in the release table", () => {
    for (const date of Object.values(RELEASE_DATES)) {
      expect(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(date);
    }
  });
});

describe("discoverGames", () => {
  it("keeps only valid game folders", () => {
    const games = discoverGames(["sonnet_5-5", "README.md", "opus_5-5", "node_modules"]);
    expect(games.map((game) => game.slug).sort()).toEqual(["opus_5-5", "sonnet_5-5"]);
  });

  it("sorts by release date, newest first, with undated games last", () => {
    const releaseDates = { "opus_4-6": "2026-02-05", "sonnet_4-6": "2026-02-17", "haiku_4-5": "2025-10-15" };
    const games = discoverGames(["haiku_4-5", "opus_4-6", "fable_5-1", "sonnet_4-6"], releaseDates);
    expect(games.map((game) => game.slug)).toEqual(["sonnet_4-6", "opus_4-6", "haiku_4-5", "fable_5-1"]);
  });

  it("orders undated games by model, then newest version, then newest folder date", () => {
    const games = discoverGames(["sonnet_5-5", "opus_4-1", "opus_5-5_20260101", "opus_5-5_20260929", "opus_5-5", "fable_5-1"], {});
    expect(games.map((game) => game.slug)).toEqual([
      "fable_5-1",
      "opus_5-5_20260929",
      "opus_5-5_20260101",
      "opus_5-5",
      "opus_4-1",
      "sonnet_5-5",
    ]);
  });
});
