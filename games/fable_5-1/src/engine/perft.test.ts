import { describe, expect, it } from "vitest";
import { Position } from "./position";
import { perft } from "./perft";

/** Node counts from the standard perft reference positions. */
const cases: Array<{ name: string; fen: string; depth: number; nodes: number }> = [
  { name: "start position d3", fen: Position.START_FEN, depth: 3, nodes: 8902 },
  { name: "start position d4", fen: Position.START_FEN, depth: 4, nodes: 197281 },
  {
    name: "kiwipete d3",
    fen: "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    depth: 3,
    nodes: 97862,
  },
  {
    name: "position 3 d4 (en passant, pins)",
    fen: "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
    depth: 4,
    nodes: 43238,
  },
  {
    name: "position 4 d3 (promotions, castling)",
    fen: "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
    depth: 3,
    nodes: 9467,
  },
  {
    name: "position 5 d3",
    fen: "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
    depth: 3,
    nodes: 62379,
  },
  {
    name: "position 6 d3",
    fen: "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
    depth: 3,
    nodes: 89890,
  },
];

describe("perft", () => {
  for (const c of cases) {
    it(c.name, () => {
      const pos = Position.fromFen(c.fen);
      expect(perft(pos, c.depth)).toBe(c.nodes);
    });
  }
});
