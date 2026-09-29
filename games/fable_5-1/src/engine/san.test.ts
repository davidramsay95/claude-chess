import { describe, expect, it } from "vitest";
import { Position } from "./position";
import { uciToMove } from "./move";
import { moveToSan } from "./san";

const san = (fen: string, uci: string): string => {
  const pos = Position.fromFen(fen);
  const move = uciToMove(pos, uci);
  if (!move) throw new Error(`illegal ${uci}`);
  return moveToSan(pos, move);
};

describe("moveToSan", () => {
  it("writes pawn moves and captures", () => {
    expect(san(Position.START_FEN, "e2e4")).toBe("e4");
    expect(san("rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2", "e4d5")).toBe("exd5");
  });

  it("writes piece moves, castling, promotion and check suffixes", () => {
    expect(san(Position.START_FEN, "g1f3")).toBe("Nf3");
    expect(san("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "e1g1")).toBe("O-O");
    expect(san("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "e1c1")).toBe("O-O-O");
    expect(san("8/P6k/8/8/8/8/8/K7 w - - 0 1", "a7a8q")).toBe("a8=Q");
    expect(san("rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2", "d8h4")).toBe("Qh4#");
    expect(san("4k3/8/8/8/8/8/8/4K2R w - - 0 1", "h1h8")).toBe("Rh8+");
  });

  it("disambiguates by file, rank, or both", () => {
    expect(san("4k3/8/8/8/8/8/4K3/R6R w - - 0 1", "a1d1")).toBe("Rad1");
    expect(san("4k3/8/8/8/R7/8/8/R3K3 w - - 0 1", "a1a2")).toBe("R1a2");
    expect(san("6k1/8/8/8/4Q2Q/8/8/K6Q w - - 0 1", "h4e1")).toBe("Qh4e1");
  });
});
