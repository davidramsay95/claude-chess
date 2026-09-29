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
    });
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
});
