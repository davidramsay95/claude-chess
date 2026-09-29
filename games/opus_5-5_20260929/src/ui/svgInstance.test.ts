import { describe, expect, it } from "vitest";
import { pieceSvg } from "./pieces";
import { svgInstance } from "./svgInstance";

describe("svgInstance", () => {
  it("gives each copy its own gradient ids and keeps references matching", () => {
    const first = svgInstance(pieceSvg("k", "w"));
    const second = svgInstance(pieceSvg("k", "w"));
    const idOf = (svg: string): string => /id="([^"]+)"/.exec(svg)?.[1] ?? "";
    expect(idOf(first)).not.toBe(idOf(second));
    for (const svg of [first, second]) {
      expect(svg).toContain(`url(#${idOf(svg)})`);
      expect(svg).not.toContain('id="opus55-grad-wk"');
    }
  });
});
