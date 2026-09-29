// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { START_FEN } from "../src/engine/position";
import type { GameState } from "../src/state";
import { copyText, exportFileName, serializeState } from "../src/ui/exporter";

const STATE: GameState = {
  version: 1,
  startFen: START_FEN,
  playerColor: "white",
  difficulty: "easy",
  moves: ["e2e4"],
  resigned: false,
};

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
});

describe("serializeState", () => {
  it("pretty prints with two spaces", () => {
    const text = serializeState(STATE);
    expect(text).toContain('\n  "version": 1');
    expect(JSON.parse(text)).toEqual(STATE);
  });
});

describe("exportFileName", () => {
  it("is a dated json file name", () => {
    expect(exportFileName(new Date("2026-09-29T10:00:00Z"))).toBe("chess-game-2026-09-29.json");
  });
});

describe("copyText", () => {
  it("uses the async clipboard when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    expect(await copyText("hello")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to execCommand when the clipboard API rejects", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    const exec = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", { value: exec, configurable: true });
    expect(await copyText("hello")).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("reports failure when nothing can copy", async () => {
    Object.defineProperty(document, "execCommand", { value: vi.fn().mockReturnValue(false), configurable: true });
    expect(await copyText("hello")).toBe(false);
  });
});
