import { describe, it, expect } from "vitest";
import { Position, START_FEN } from "../src/engine/position.ts";

function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  const moves = pos.legalMoves();
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (const move of moves) {
    pos.makeMove(move);
    nodes += perft(pos, depth - 1);
    pos.unmakeMove();
  }
  return nodes;
}

const KIWIPETE = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -";

describe("perft", () => {
  it.each([
    [1, 20],
    [2, 400],
    [3, 8_902],
    [4, 197_281],
  ])("start position depth %i is %i", (depth, expected) => {
    expect(perft(Position.fromFen(START_FEN), depth)).toBe(expected);
  });

  it.each([
    [1, 48],
    [2, 2_039],
    [3, 97_862],
  ])("kiwipete depth %i is %i", (depth, expected) => {
    expect(perft(Position.fromFen(KIWIPETE), depth)).toBe(expected);
  });

  // An endgame loaded with en passant and promotion edge cases.
  it.each([
    [1, 14],
    [2, 191],
    [3, 2_812],
    [4, 43_238],
  ])("position 3 depth %i is %i", (depth, expected) => {
    expect(perft(Position.fromFen("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - -"), depth)).toBe(expected);
  });

  // Underpromotion and castling rights corruption.
  it.each([
    [1, 6],
    [2, 264],
    [3, 9_467],
  ])("position 4 depth %i is %i", (depth, expected) => {
    const fen = "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq -";
    expect(perft(Position.fromFen(fen), depth)).toBe(expected);
  });

  // Mirrored version of position 4, to catch colour-asymmetric bugs.
  it.each([
    [1, 6],
    [2, 264],
    [3, 9_467],
  ])("position 4 mirrored depth %i is %i", (depth, expected) => {
    const fen = "r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ -";
    expect(perft(Position.fromFen(fen), depth)).toBe(expected);
  });

  it.each([
    [1, 44],
    [2, 1_486],
    [3, 62_379],
  ])("position 5 depth %i is %i", (depth, expected) => {
    const fen = "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ -";
    expect(perft(Position.fromFen(fen), depth)).toBe(expected);
  });

  it("restores the position exactly after make/unmake", () => {
    const pos = Position.fromFen(KIWIPETE);
    const before = pos.toFen();
    const keyBefore = pos.key();
    for (const move of pos.legalMoves()) {
      pos.makeMove(move);
      pos.unmakeMove();
      expect(pos.toFen()).toBe(before);
      expect(pos.key()).toBe(keyBefore);
    }
  });
});
