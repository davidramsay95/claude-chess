import { describe, expect, it } from "vitest";
import { Position, START_FEN } from "../src/engine/position";

const perft = (pos: Position, depth: number): number => {
  if (depth === 0) return 1;
  const moves = pos.legalMoves();
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (const m of moves) {
    pos.makeMove(m);
    nodes += perft(pos, depth - 1);
    pos.unmakeMove();
  }
  return nodes;
};

const KIWIPETE = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
const POSITION3 = "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1";
const POSITION4 = "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1";
const POSITION5 = "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8";

describe("perft", () => {
  it.each([
    [1, 20],
    [2, 400],
    [3, 8902],
    [4, 197281],
  ])("start position depth %i", (depth, expected) => {
    expect(perft(Position.fromFen(START_FEN), depth)).toBe(expected);
  });

  it.each([
    [1, 48],
    [2, 2039],
    [3, 97862],
  ])("kiwipete depth %i", (depth, expected) => {
    expect(perft(Position.fromFen(KIWIPETE), depth)).toBe(expected);
  });

  it.each([
    [1, 14],
    [2, 191],
    [3, 2812],
    [4, 43238],
  ])("endgame position 3 depth %i", (depth, expected) => {
    expect(perft(Position.fromFen(POSITION3), depth)).toBe(expected);
  });

  it.each([
    [1, 6],
    [2, 264],
    [3, 9467],
  ])("promotion heavy position 4 depth %i", (depth, expected) => {
    expect(perft(Position.fromFen(POSITION4), depth)).toBe(expected);
  });

  it.each([
    [1, 44],
    [2, 1486],
    [3, 62379],
  ])("position 5 depth %i", (depth, expected) => {
    expect(perft(Position.fromFen(POSITION5), depth)).toBe(expected);
  });
});
