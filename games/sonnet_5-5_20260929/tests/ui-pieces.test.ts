import { describe, expect, it } from "vitest";
import { BISHOP, KING, KNIGHT, PAWN, QUEEN, ROOK, makePiece } from "../src/engine/position";
import { PIECE_NAMES, pieceLabel, pieceSvg } from "../src/pieces";

describe("pieceSvg", () => {
  it("draws all twelve pieces as distinct inline SVG", () => {
    const seen = new Set<string>();
    for (const color of [0, 1]) {
      for (const type of [PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING]) {
        const svg = pieceSvg(makePiece(type, color));
        expect(svg.startsWith("<svg")).toBe(true);
        expect(svg).toContain("viewBox");
        seen.add(svg);
      }
    }
    expect(seen.size).toBe(12);
  });

  it("uses only relative content and no dashes that break house style", () => {
    const svg = pieceSvg(makePiece(KNIGHT, 1));
    expect(svg).not.toContain(String.fromCharCode(8212));
    expect(svg).not.toContain("href");
  });

  it("names pieces for screen readers", () => {
    expect(PIECE_NAMES[QUEEN]).toBe("queen");
    expect(pieceLabel(makePiece(KING, 0))).toBe("white king");
    expect(pieceLabel(makePiece(PAWN, 1))).toBe("black pawn");
  });

  it("throws on an empty square code", () => {
    expect(() => pieceSvg(0)).toThrow();
  });
});
