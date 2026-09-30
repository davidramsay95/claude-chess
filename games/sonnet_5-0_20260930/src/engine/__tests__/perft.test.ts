import { describe, expect, it } from "vitest";
import { createGame } from "../index";
import { perft } from "../perft";

describe("perft from the standard starting position", () => {
  const expected = [20, 400, 8902, 197281];

  expected.forEach((nodes, i) => {
    const depth = i + 1;
    it(`depth ${depth} === ${nodes}`, () => {
      const state = createGame();
      expect(perft(state, depth)).toBe(nodes);
    });
  });
});

describe("perft from the Kiwipete position", () => {
  const KIWIPETE =
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -";
  const expected = [48, 2039, 97862];

  expected.forEach((nodes, i) => {
    const depth = i + 1;
    it(`depth ${depth} === ${nodes}`, () => {
      const state = createGame(KIWIPETE);
      expect(perft(state, depth)).toBe(nodes);
    });
  });
});
