import { describe, it, expect } from "vitest";
import { kindClass, pieceGeometry, pieceSvg, sideClass } from "../src/ui/pieces";
import type { PieceColor, PieceKind } from "../src/ui/pieces";

const KINDS: PieceKind[] = ["p", "n", "b", "r", "q", "k"];
const COLORS: PieceColor[] = ["w", "b"];

const ALLOWED_TAGS = new Set(["g", "path", "circle", "ellipse", "rect", "polygon"]);

/** The only legitimate occurrence of "http" is the SVG namespace on the wrapper. */
const stripXmlns = (svg: string): string => svg.replace(/\sxmlns="[^"]*"/g, "");

describe("pieceSvg", () => {
  for (const kind of KINDS) {
    for (const color of COLORS) {
      it(`wraps ${color}${kind} in a 0 0 64 64 svg with the right classes`, () => {
        const svg = pieceSvg(kind, color);
        expect(svg.startsWith('<svg viewBox="0 0 64 64"')).toBe(true);
        expect(svg.endsWith("</svg>")).toBe(true);
        expect(svg).toContain(`class="piece ${sideClass(color)} ${kindClass(kind)}"`);
        expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
        expect(svg).toContain('aria-hidden="true"');
        expect(svg).toContain('focusable="false"');
        expect(svg).toContain(pieceGeometry(kind));
      });

      it(`keeps ${color}${kind} free of external references and fonts`, () => {
        const svg = pieceSvg(kind, color);
        expect(stripXmlns(svg)).not.toContain("http");
        expect(svg).not.toContain("url(/");
        expect(svg).not.toContain("<image");
        expect(svg).not.toContain("font-family");
      });

      it(`colours ${color}${kind} only through css custom properties`, () => {
        const svg = pieceSvg(kind, color);
        expect(svg).toContain("var(--pc-fill");
        expect(svg).toContain("var(--pc-stroke");
      });
    }
  }

  it("keeps the colour class out of the kind class namespace", () => {
    const sides = new Set(COLORS.map(sideClass));
    const kinds = new Set(KINDS.map(kindClass));
    for (const side of sides) expect(kinds.has(side)).toBe(false);
    for (const kind of kinds) expect(sides.has(kind)).toBe(false);
    // The bishop is the case that bit: kind "b" and the black side share a letter.
    const whiteBishop = pieceSvg("b", "w");
    expect(whiteBishop).toContain(sideClass("w"));
    expect(whiteBishop).not.toContain(sideClass("b"));
  });

  it("uses identical geometry for both colours", () => {
    for (const kind of KINDS) {
      const white = pieceSvg(kind, "w").replace(sideClass("w"), "side-X");
      const black = pieceSvg(kind, "b").replace(sideClass("b"), "side-X");
      expect(white).toBe(black);
    }
  });
});

describe("pieceGeometry", () => {
  it("emits no <svg> wrapper", () => {
    for (const kind of KINDS) {
      expect(pieceGeometry(kind)).not.toContain("<svg");
    }
  });

  it("uses only allowed svg primitives", () => {
    for (const kind of KINDS) {
      const geometry = pieceGeometry(kind);
      const tags = [...geometry.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9-]*)/g)].map((m) => m[1]);
      expect(tags.length).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(ALLOWED_TAGS.has(tag), `unexpected tag <${tag}> in "${kind}"`).toBe(true);
      }
    }
  });

  it("balances every group element", () => {
    for (const kind of KINDS) {
      const geometry = pieceGeometry(kind);
      const opens = geometry.match(/<g[\s>]/g)?.length ?? 0;
      const closes = geometry.match(/<\/g>/g)?.length ?? 0;
      expect(opens).toBe(closes);
      expect(opens).toBeGreaterThan(0);
    }
  });

  it("gives every piece a distinct silhouette", () => {
    const seen = new Map<string, PieceKind>();
    for (const kind of KINDS) {
      const geometry = pieceGeometry(kind);
      expect(seen.has(geometry)).toBe(false);
      seen.set(geometry, kind);
    }
    expect(seen.size).toBe(KINDS.length);
  });

  it("keeps every coordinate inside the 0..64 viewBox", () => {
    const coordinate = /(?:\bcx=|\bcy=|\bx=|\by=|[MLCQ])\s*"?\s*(-?\d+(?:\.\d+)?)/g;
    for (const kind of KINDS) {
      const geometry = pieceGeometry(kind);
      const numbers = [...geometry.matchAll(coordinate)].map((m) => Number(m[1]));
      expect(numbers.length).toBeGreaterThan(10);
      for (const value of numbers) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(64);
      }
    }
  });

  it("stands every piece on the shared base", () => {
    for (const kind of KINDS) {
      expect(pieceGeometry(kind)).toContain("M 13.5 58 L 50.5 58");
    }
  });
});
