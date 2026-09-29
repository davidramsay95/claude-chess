// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const renderGlyph = async (basePath: string | undefined): Promise<HTMLElement> => {
  vi.resetModules();
  if (basePath === undefined) {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "");
  } else {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", basePath);
  }
  const { PieceGlyph } = await import("./PieceGlyph");
  const { container } = render(<PieceGlyph color="w" type="k" />);
  return container.querySelector("[data-piece]") as HTMLElement; // querySelector is typed nullable; the glyph always renders this attribute.
};

describe("PieceGlyph", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("points at the root-level piece artwork when there is no base path", async () => {
    const glyph = await renderGlyph(undefined);
    expect(glyph.style.backgroundImage).toBe('url("/pieces/wk.svg")');
  });

  it("prefixes the piece artwork with the deployment base path", async () => {
    const glyph = await renderGlyph("/play/opus_5-5");
    expect(glyph.style.backgroundImage).toBe('url("/play/opus_5-5/pieces/wk.svg")');
  });
});
