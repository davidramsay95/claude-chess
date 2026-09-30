import { describe, expect, test } from "vitest";
import { Board, START_FEN } from "../src/engine/board";

describe("FEN parsing and serialisation", () => {
  test("round-trips the standard start position", () => {
    const board = Board.fromFen(START_FEN);
    expect(board.toFen()).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  });

  test("round-trips Kiwipete including castling rights", () => {
    const fen = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
    expect(Board.fromFen(fen).toFen()).toBe(fen);
  });

  test("round-trips a position with an en passant square and black to move", () => {
    const fen = "rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 2";
    expect(Board.fromFen(fen).toFen()).toBe(fen);
  });

  test("reports the side to move", () => {
    expect(Board.fromFen(START_FEN).turn()).toBe("w");
    expect(
      Board.fromFen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1").turn()
    ).toBe("b");
  });

  test("rejects malformed FEN strings", () => {
    expect(() => Board.fromFen("not a fen")).toThrow();
    expect(() => Board.fromFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1")).toThrow();
    expect(() => Board.fromFen("")).toThrow();
  });
});
