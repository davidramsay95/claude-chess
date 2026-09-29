import { describe, expect, it } from "vitest";
import { Position } from "./position";
import { evaluate } from "./evaluate";

/** Mirrors a FEN vertically and swaps colours so the same structure is seen from the other side. */
const flipFen = (fen: string): string => {
  const [board, turn, castling, ep, half, full] = fen.split(" ");
  const swapCase = (s: string): string =>
    s
      .split("")
      .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
      .join("");
  const flippedBoard = board.split("/").reverse().map(swapCase).join("/");
  const flippedCastling = castling === "-" ? "-" : swapCase(castling);
  const flippedEp = ep === "-" ? "-" : `${ep[0]}${9 - Number(ep[1])}`;
  return `${flippedBoard} ${turn === "w" ? "b" : "w"} ${flippedCastling} ${flippedEp} ${half} ${full}`;
};

describe("evaluate", () => {
  it("scores the start position near zero", () => {
    const score = evaluate(Position.fromFen(Position.START_FEN));
    expect(Math.abs(score)).toBeLessThan(50);
  });

  it("rewards an extra queen for the side to move", () => {
    const score = evaluate(Position.fromFen("4k3/8/8/8/8/8/8/3QK3 w - - 0 1"));
    expect(score).toBeGreaterThan(700);
  });

  it("penalises an extra queen for the opponent", () => {
    const score = evaluate(Position.fromFen("4k3/8/8/8/8/8/8/3QK3 b - - 0 1"));
    expect(score).toBeLessThan(-700);
  });

  const fens = [
    "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
    "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1",
  ];

  it("negates when only the side to move changes", () => {
    for (const fen of fens) {
      const asWhite = evaluate(Position.fromFen(fen));
      const asBlack = evaluate(Position.fromFen(fen.replace(" w ", " b ")));
      expect(Math.abs(asWhite + asBlack)).toBeLessThanOrEqual(2);
    }
  });

  it("is symmetric under colour flip with the mover swapped", () => {
    // Mirroring the board and swapping colours gives the new mover exactly the old mover's position.
    for (const fen of fens) {
      const a = evaluate(Position.fromFen(fen));
      const b = evaluate(Position.fromFen(flipFen(fen)));
      expect(Math.abs(a - b)).toBeLessThanOrEqual(2);
    }
  });

  it("prefers the bishop pair over bishop and knight", () => {
    const pair = evaluate(Position.fromFen("4k3/8/8/8/8/8/8/2B1KB2 w - - 0 1"));
    const mixed = evaluate(Position.fromFen("4k3/8/8/8/8/8/8/2B1KN2 w - - 0 1"));
    expect(pair).toBeGreaterThan(mixed);
  });

  it("rewards a passed pawn over a blocked one", () => {
    const passed = evaluate(Position.fromFen("4k3/8/8/8/3P4/8/8/4K3 w - - 0 1"));
    const blocked = evaluate(Position.fromFen("4k3/8/8/3p4/3P4/8/8/4K3 w - - 0 1"));
    expect(passed).toBeGreaterThan(blocked);
  });
});
