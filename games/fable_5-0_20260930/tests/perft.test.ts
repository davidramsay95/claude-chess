import { describe, expect, test } from "vitest";
import { Board, START_FEN } from "../src/engine/board";

const KIWIPETE = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";

describe("perft from the start position", () => {
  test("depth 1 is 20", () => {
    expect(Board.fromFen(START_FEN).perft(1)).toBe(20);
  });

  test("depth 2 is 400", () => {
    expect(Board.fromFen(START_FEN).perft(2)).toBe(400);
  });

  test("depth 3 is 8902", () => {
    expect(Board.fromFen(START_FEN).perft(3)).toBe(8902);
  });

  test("depth 4 is 197281", () => {
    expect(Board.fromFen(START_FEN).perft(4)).toBe(197281);
  });
});

describe("perft from Kiwipete", () => {
  test("depth 1 is 48", () => {
    expect(Board.fromFen(KIWIPETE).perft(1)).toBe(48);
  });

  test("depth 2 is 2039", () => {
    expect(Board.fromFen(KIWIPETE).perft(2)).toBe(2039);
  });

  test("depth 3 is 97862", () => {
    expect(Board.fromFen(KIWIPETE).perft(3)).toBe(97862);
  });
});

describe("perft on en passant edge cases", () => {
  test("position 3 from the CPW perft suite (ep pins)", () => {
    const fen = "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1";
    const board = Board.fromFen(fen);
    expect(board.perft(1)).toBe(14);
    expect(board.perft(2)).toBe(191);
    expect(board.perft(3)).toBe(2812);
    expect(board.perft(4)).toBe(43238);
  });

  test("position 5 from the CPW perft suite (promotions and checks)", () => {
    const fen = "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8";
    const board = Board.fromFen(fen);
    expect(board.perft(1)).toBe(44);
    expect(board.perft(2)).toBe(1486);
    expect(board.perft(3)).toBe(62379);
  });
});
