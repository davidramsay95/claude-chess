import { describe, expect, it } from "vitest";
import { Board } from "../src/engine/board.ts";
import { perft } from "../src/engine/movegen.ts";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const KIWIPETE = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";

describe("perft from the start position", () => {
  it("matches known node counts at depths 1-4", () => {
    const board = Board.fromFen(START_FEN);
    expect(perft(board, 1)).toBe(20);
    expect(perft(board, 2)).toBe(400);
    expect(perft(board, 3)).toBe(8902);
    expect(perft(board, 4)).toBe(197281);
  });
});

describe("perft from Kiwipete", () => {
  it("matches known node counts at depths 1-3", () => {
    const board = Board.fromFen(KIWIPETE);
    expect(perft(board, 1)).toBe(48);
    expect(perft(board, 2)).toBe(2039);
    expect(perft(board, 3)).toBe(97862);
  });
});

describe("perft on tricky positions", () => {
  it("position 3 (en passant, checks) matches", () => {
    const board = Board.fromFen("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1");
    expect(perft(board, 1)).toBe(14);
    expect(perft(board, 2)).toBe(191);
    expect(perft(board, 3)).toBe(2812);
    expect(perft(board, 4)).toBe(43238);
  });

  it("position 4 (promotions, pins) matches", () => {
    const board = Board.fromFen(
      "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
    );
    expect(perft(board, 1)).toBe(6);
    expect(perft(board, 2)).toBe(264);
    expect(perft(board, 3)).toBe(9467);
  });

  it("position 5 matches", () => {
    const board = Board.fromFen("rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8");
    expect(perft(board, 1)).toBe(44);
    expect(perft(board, 2)).toBe(1486);
    expect(perft(board, 3)).toBe(62379);
  });
});
