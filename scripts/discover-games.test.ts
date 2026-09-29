import { describe, expect, it } from "vitest";
import { parseGameFolderName, discoverGames } from "./discover-games.ts";

describe("parseGameFolderName", () => {
  it("parses model, version and subversion from the folder name", () => {
    expect(parseGameFolderName("fable_5-1")).toEqual({
      slug: "fable_5-1",
      model: "fable",
      version: "5",
      subversion: "1",
      label: "Fable 5.1",
      date: null,
    });
  });

  it("parses an optional YYYYMMDD date suffix and shows it in the label", () => {
    expect(parseGameFolderName("fable_5-1_20260929")).toEqual({
      slug: "fable_5-1_20260929",
      model: "fable",
      version: "5",
      subversion: "1",
      label: "Fable 5.1 (2026-09-29)",
      date: "2026-09-29",
    });
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
});

describe("discoverGames", () => {
  it("keeps only valid game folders, sorted by model name then newest version first", () => {
    const games = discoverGames(["sonnet_5-5", "README.md", "opus_5-5", "fable_5-1", "opus_4-1"]);
    expect(games.map((game) => game.slug)).toEqual(["fable_5-1", "opus_5-5", "opus_4-1", "sonnet_5-5"]);
  });

  it("sorts runs of the same model version with the newest date first, undated last", () => {
    const games = discoverGames(["opus_5-5_20260101", "opus_5-5", "opus_5-5_20260929"]);
    expect(games.map((game) => game.slug)).toEqual(["opus_5-5_20260929", "opus_5-5_20260101", "opus_5-5"]);
  });
});
