import { describe, it, expect } from "vitest";
import { parseFen, START_FEN } from "../src/engine/fen.js";
import { perft } from "../src/engine/moves.js";

describe("perft from the starting position", () => {
  const pos = parseFen(START_FEN);
  it("depth 1 = 20", () => { expect(perft(pos, 1)).toBe(20); });
  it("depth 2 = 400", () => { expect(perft(pos, 2)).toBe(400); });
  it("depth 3 = 8902", () => { expect(perft(pos, 3)).toBe(8902); });
  it("depth 4 = 197281", () => { expect(perft(pos, 4)).toBe(197281); });
});

describe("perft from Kiwipete", () => {
  const fen = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
  const pos = parseFen(fen);
  it("depth 1 = 48", () => { expect(perft(pos, 1)).toBe(48); });
  it("depth 2 = 2039", () => { expect(perft(pos, 2)).toBe(2039); });
  it("depth 3 = 97862", () => { expect(perft(pos, 3)).toBe(97862); });
});

describe("perft position 3 (en passant edge cases)", () => {
  // https://www.chessprogramming.org/Perft_Results
  const fen = "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1";
  const pos = parseFen(fen);
  it("depth 1 = 14", () => { expect(perft(pos, 1)).toBe(14); });
  it("depth 2 = 191", () => { expect(perft(pos, 2)).toBe(191); });
  it("depth 3 = 2812", () => { expect(perft(pos, 3)).toBe(2812); });
  it("depth 4 = 43238", () => { expect(perft(pos, 4)).toBe(43238); });
});

describe("perft position 4 (promotion, castling under attack)", () => {
  const fen = "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1";
  const pos = parseFen(fen);
  it("depth 1 = 6", () => { expect(perft(pos, 1)).toBe(6); });
  it("depth 2 = 264", () => { expect(perft(pos, 2)).toBe(264); });
  it("depth 3 = 9467", () => { expect(perft(pos, 3)).toBe(9467); });
});
