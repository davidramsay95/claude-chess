import { describe, expect, it } from "vitest";
import { pieceSvg, type PieceColor, type PieceKind } from "./pieces";

const KINDS: readonly PieceKind[] = ["p", "n", "b", "r", "q", "k"];
const COLORS: readonly PieceColor[] = ["w", "b"];

interface Combination {
  kind: PieceKind;
  color: PieceColor;
}

const ALL: readonly Combination[] = KINDS.flatMap((kind) => COLORS.map((color) => ({ kind, color })));

const gradientIds = (svg: string): string[] =>
  [...svg.matchAll(/<(?:linearGradient|radialGradient)[^>]*\sid="([^"]+)"/g)].map((match) => match[1] ?? "");

const countMatches = (text: string, pattern: RegExp): number => [...text.matchAll(pattern)].length;

/** Minimal XML structure check: every opened element is closed in order and attributes are quoted. */
const isWellNested = (markup: string): boolean => {
  const stack: string[] = [];
  const tagPattern = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/g;
  let consumed = 0;
  for (const match of markup.matchAll(tagPattern)) {
    if (markup.slice(consumed, match.index).includes("<")) {
      return false;
    }
    consumed = match.index + match[0].length;
    const [, closing, name, , selfClosing] = match;
    if (closing === "/") {
      if (stack.pop() !== name) {
        return false;
      }
    } else if (selfClosing !== "/") {
      stack.push(name ?? "");
    }
  }
  return stack.length === 0 && !markup.slice(consumed).includes("<");
};

describe("pieceSvg", () => {
  it.each(ALL)("returns a standalone svg for $color$kind", ({ kind, color }) => {
    const svg = pieceSvg(kind, color);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('viewBox="0 0 100 100"');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it.each(ALL)("has no width or height attribute on the root for $color$kind", ({ kind, color }) => {
    const rootTag = pieceSvg(kind, color).match(/^<svg[^>]*>/)?.[0] ?? "";
    expect(rootTag).not.toMatch(/\swidth=/);
    expect(rootTag).not.toMatch(/\sheight=/);
  });

  it.each(ALL)("has balanced svg tags for $color$kind", ({ kind, color }) => {
    const svg = pieceSvg(kind, color);
    expect(countMatches(svg, /<svg[\s>]/g)).toBe(1);
    expect(countMatches(svg, /<\/svg>/g)).toBe(1);
  });

  it.each(ALL)("has properly nested elements for $color$kind", ({ kind, color }) => {
    expect(isWellNested(pieceSvg(kind, color))).toBe(true);
  });

  it.each(ALL)("references no external URL other than the svg namespace for $color$kind", ({ kind, color }) => {
    const withoutNamespace = pieceSvg(kind, color).replaceAll('xmlns="http://www.w3.org/2000/svg"', "");
    expect(withoutNamespace).not.toMatch(/https?:/);
  });

  it.each(KINDS)("renders white and black %s differently", (kind) => {
    expect(pieceSvg(kind, "w")).not.toBe(pieceSvg(kind, "b"));
  });

  it("renders each kind differently", () => {
    const shapes = new Set(KINDS.map((kind) => pieceSvg(kind, "w")));
    expect(shapes.size).toBe(KINDS.length);
  });

  it("uses gradient ids that are unique across all twelve pieces", () => {
    const perPiece = ALL.map(({ kind, color }) => gradientIds(pieceSvg(kind, color)));
    for (const ids of perPiece) {
      expect(ids.length).toBeGreaterThan(0);
    }
    const flat = perPiece.flat();
    expect(new Set(flat).size).toBe(flat.length);
  });

  it("only references gradient ids defined in the same svg", () => {
    for (const { kind, color } of ALL) {
      const svg = pieceSvg(kind, color);
      const defined = new Set(gradientIds(svg));
      const referenced = [...svg.matchAll(/url\(#([^)]+)\)/g)].map((match) => match[1] ?? "");
      for (const id of referenced) {
        expect(defined.has(id)).toBe(true);
      }
    }
  });

  it("is deterministic for the same piece", () => {
    expect(pieceSvg("q", "b")).toBe(pieceSvg("q", "b"));
  });
});
