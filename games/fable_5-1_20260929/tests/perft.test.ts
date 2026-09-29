import { describe, expect, it } from "vitest";
import { Position } from "../src/engine/position";
import { perft } from "../src/engine/perft";
import { START_FEN } from "../src/engine/types";

const KIWIPETE = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
const POSITION_3 = "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1";
const POSITION_4 = "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1";
const POSITION_5 = "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8";

describe("FEN", () => {
  it("round-trips the start position", () => {
    expect(Position.fromFen(START_FEN).toFen()).toBe(START_FEN);
  });

  it("round-trips Kiwipete", () => {
    expect(Position.fromFen(KIWIPETE).toFen()).toBe(KIWIPETE);
  });

  it("rejects garbage", () => {
    expect(() => Position.fromFen("not a fen")).toThrow();
  });
});

describe("perft from the start position", () => {
  const pos = Position.fromFen(START_FEN);
  it.each([
    [1, 20],
    [2, 400],
    [3, 8902],
    [4, 197281],
  ])("depth %i gives %i nodes", (depth, nodes) => {
    expect(perft(pos, depth)).toBe(nodes);
  });
});

describe("perft from Kiwipete", () => {
  const pos = Position.fromFen(KIWIPETE);
  it.each([
    [1, 48],
    [2, 2039],
    [3, 97862],
  ])("depth %i gives %i nodes", (depth, nodes) => {
    expect(perft(pos, depth)).toBe(nodes);
  });
});

describe("perft from other well-known positions", () => {
  it("position 3 (en passant and promotion heavy)", () => {
    const pos = Position.fromFen(POSITION_3);
    expect(perft(pos, 1)).toBe(14);
    expect(perft(pos, 2)).toBe(191);
    expect(perft(pos, 3)).toBe(2812);
    expect(perft(pos, 4)).toBe(43238);
  });

  it("position 4 (promotions and castling into attacked squares)", () => {
    const pos = Position.fromFen(POSITION_4);
    expect(perft(pos, 1)).toBe(6);
    expect(perft(pos, 2)).toBe(264);
    expect(perft(pos, 3)).toBe(9467);
  });

  it("position 5 (mirrored castling and checks)", () => {
    const pos = Position.fromFen(POSITION_5);
    expect(perft(pos, 1)).toBe(44);
    expect(perft(pos, 2)).toBe(1486);
    expect(perft(pos, 3)).toBe(62379);
  });
});

describe("make and unmake", () => {
  it("restores the position and hash after every move", () => {
    const pos = Position.fromFen(KIWIPETE);
    const before = pos.toFen();
    const hashBefore = pos.hash;
    for (const move of pos.legalMoves()) {
      const undo = pos.makeMove(move);
      pos.unmakeMove(move, undo);
      expect(pos.toFen()).toBe(before);
      expect(pos.hash).toBe(hashBefore);
    }
  });
});
