import { describe, expect, it } from "vitest";
import { createGame, getStatus } from "../index";

describe("insufficient material draws", () => {
  it("K vs K is a draw", () => {
    expect(getStatus(createGame("k7/8/8/8/8/8/8/7K w - -"))).toBe(
      "draw-insufficient-material",
    );
  });

  it("K+B vs K is a draw", () => {
    expect(getStatus(createGame("k7/8/8/8/8/8/8/6BK w - -"))).toBe(
      "draw-insufficient-material",
    );
  });

  it("K+N vs K is a draw", () => {
    expect(getStatus(createGame("k7/8/8/8/8/8/8/6NK w - -"))).toBe(
      "draw-insufficient-material",
    );
  });

  it("K+B vs K+B with same-colored bishops is a draw", () => {
    // White bishop on c1 (dark square), black bishop on f8 (dark square).
    expect(getStatus(createGame("5b2/8/8/8/8/8/8/2B4K w - -"))).toBe(
      "draw-insufficient-material",
    );
  });

  it("K+B vs K+B with opposite-colored bishops is NOT an automatic draw", () => {
    // White bishop on c1 (dark), black bishop on g8 (light).
    expect(getStatus(createGame("6b1/8/8/8/8/8/8/2B4K w - -"))).not.toBe(
      "draw-insufficient-material",
    );
  });

  it("K+N+N vs K is NOT an automatic draw", () => {
    expect(getStatus(createGame("k7/8/8/8/8/8/8/5NNK w - -"))).not.toBe(
      "draw-insufficient-material",
    );
  });
});
