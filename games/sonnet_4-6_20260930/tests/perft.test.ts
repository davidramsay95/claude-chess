import { describe, it, expect } from "vitest";
import { parseFen } from "../src/engine/board.js";
import { perft } from "../src/engine/moveGen.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const KIWIPETE = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -";

describe("Perft – starting position", () => {
  it("depth 1 = 20", () => {
    expect(perft(parseFen(START_FEN), 1)).toBe(20);
  });

  it("depth 2 = 400", () => {
    expect(perft(parseFen(START_FEN), 2)).toBe(400);
  });

  it("depth 3 = 8902", () => {
    expect(perft(parseFen(START_FEN), 3)).toBe(8902);
  });

  it("depth 4 = 197281", () => {
    expect(perft(parseFen(START_FEN), 4)).toBe(197281);
  });
});

describe("Perft – Kiwipete", () => {
  it("depth 1 = 48", () => {
    expect(perft(parseFen(KIWIPETE), 1)).toBe(48);
  });

  it("depth 2 = 2039", () => {
    expect(perft(parseFen(KIWIPETE), 2)).toBe(2039);
  });

  it("depth 3 = 97862", () => {
    expect(perft(parseFen(KIWIPETE), 3)).toBe(97862);
  });
});
