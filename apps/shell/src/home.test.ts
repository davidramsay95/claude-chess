import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import config from "../vite.config.ts";
import type { GameSummary } from "./gameSummary.ts";
import { parseFenPlacement, renderBoard, renderChallengers } from "./home.ts";

const shellRoot = resolve(import.meta.dirname, "..");
const loadPage = (fileName: string): Document =>
  new DOMParser().parseFromString(readFileSync(resolve(shellRoot, fileName), "utf8"), "text/html");

describe("parseFenPlacement", () => {
  it("expands digits into empty squares, top rank first", () => {
    const rows = parseFenPlacement("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");
    expect(rows).toHaveLength(8);
    expect(rows[0]).toEqual(["r", "n", "b", "q", "k", "b", "n", "r"]);
    expect(rows[2]).toEqual(Array(8).fill(null));
    expect(rows[4]).toEqual([null, null, null, null, "P", null, null, null]);
  });

  it("rejects a placement that is not eight ranks of eight files", () => {
    expect(() => parseFenPlacement("8/8/8")).toThrow(/rank/i);
    expect(() => parseFenPlacement("9/8/8/8/8/8/8/8")).toThrow(/file/i);
  });
});

describe("renderBoard", () => {
  const container = (): HTMLElement => document.getElementById("board") as HTMLElement; // Created in beforeEach.

  beforeEach(() => {
    document.body.innerHTML = '<div id="board"></div>';
    renderBoard(container(), "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR", ["e2", "e4"], "Position after 1.e4");
  });

  it("draws 64 squares with alternating colours, a1 dark", () => {
    const squares = container().querySelectorAll<HTMLElement>("[data-square]");
    expect(squares).toHaveLength(64);
    expect(container().querySelector('[data-square="a1"]')?.classList.contains("dark")).toBe(true);
    expect(container().querySelector('[data-square="h1"]')?.classList.contains("light")).toBe(true);
  });

  it("places pieces on their squares", () => {
    const pawn = container().querySelector('[data-square="e4"]');
    expect(pawn?.textContent).toContain("♟");
    expect(pawn?.querySelector(".piece")?.classList.contains("white")).toBe(true);
    const king = container().querySelector('[data-square="e8"]');
    expect(king?.textContent).toContain("♚");
    expect(king?.querySelector(".piece")?.classList.contains("black")).toBe(true);
    expect(container().querySelector('[data-square="e5"]')?.textContent).toBe("");
  });

  it("highlights the given squares and describes the board for assistive tech", () => {
    const highlighted = [...container().querySelectorAll("[data-square].last-move")].map((s) => s.getAttribute("data-square"));
    expect(highlighted.sort()).toEqual(["e2", "e4"]);
    expect(container().getAttribute("role")).toBe("img");
    expect(container().getAttribute("aria-label")).toBe("Position after 1.e4");
  });
});

describe("renderChallengers", () => {
  const games: GameSummary[] = [
    { slug: "fable_5-1_20260929", label: "Fable 5.1 (2026-09-29)", date: "2026-09-29" },
    { slug: "opus_5-5_20260929", label: "Opus 5.5 (2026-09-29)", date: "2026-09-29" },
  ];

  it("lists each game with a link that opens it in the game page", () => {
    const list = document.createElement("ul");
    renderChallengers(list, games);
    const links = [...list.querySelectorAll("a")];
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/games#fable_5-1_20260929", "/games#opus_5-5_20260929"]);
    expect(links[0].textContent).toContain("Fable 5.1");
    expect(list.textContent).toContain("2026-09-29");
  });
});

describe("home page", () => {
  const page = loadPage("index.html");
  const hrefs = [...page.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href"));

  it("has a title and a single main heading", () => {
    expect(page.title).toBe("Claude Chess");
    expect(page.querySelectorAll("h1")).toHaveLength(1);
  });

  it("links to the game page and both legal pages", () => {
    expect(hrefs).toContain("/games");
    expect(hrefs).toContain("/terms-of-service");
    expect(hrefs).toContain("/privacy-policy");
  });

  it("has mount points for the board and the challenger list", () => {
    expect(page.querySelector("#board")).not.toBeNull();
    expect(page.querySelector("#challengers")).not.toBeNull();
  });
});

describe("game page", () => {
  it("hosts the shell", () => {
    const page = loadPage("games.html");
    expect(page.getElementById("root")).not.toBeNull();
    expect(page.querySelector('script[src="/src/main.ts"]')).not.toBeNull();
  });
});

describe("build entries", () => {
  it("emits the home page and the game page", () => {
    const input = config.build?.rollupOptions?.input as Record<string, string>;
    expect(input.main).toBe(resolve(shellRoot, "index.html"));
    expect(input.games).toBe(resolve(shellRoot, "games.html"));
  });
});
