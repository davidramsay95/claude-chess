import { describe, expect, it } from "vitest";
import { Position, START_FEN, moveToUci, perft } from "./position";

const KIWIPETE = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";

describe("FEN", () => {
  it("round-trips the start position", () => {
    expect(Position.fromFen(START_FEN).toFen()).toBe(START_FEN);
  });

  it("round-trips a position with en passant and clocks", () => {
    const fen = "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3";
    expect(Position.fromFen(fen).toFen()).toBe(fen);
  });

  it("accepts a four-field FEN and fills in clocks", () => {
    expect(Position.fromFen(KIWIPETE.replace(" 0 1", "")).toFen()).toBe(KIWIPETE);
  });

  it.each([
    ["", "empty"],
    ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1", "seven ranks"],
    ["rnbqkbnr/pppppppp/9/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "rank too long"],
    ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1", "bad side"],
    ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNX w KQkq - 0 1", "bad piece"],
    ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQ1BNR w KQkq - 0 1", "missing white king"],
    ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq e9 0 1", "bad ep square"],
    ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - -1 1", "negative clock"],
    ["4k3/8/8/8/8/8/8/4K3 w K - 0 1", "castling rights without a rook"],
    ["4k3/8/8/8/8/8/8/R3K1R1 w KQ - 0 1", "castling rook missing from h1"],
    ["4k3/4R3/8/8/8/8/8/4K3 w - - 0 1", "side not to move is in check"],
    ["P3k3/8/8/8/8/8/8/4K3 w - - 0 1", "pawn on the last rank"],
  ])("rejects %s (%s)", (fen) => {
    expect(() => Position.fromFen(fen)).toThrow();
  });
});

describe("perft", () => {
  it.each([
    [1, 20],
    [2, 400],
    [3, 8902],
    [4, 197281],
  ])("start position depth %i = %i", (depth, nodes) => {
    expect(perft(Position.fromFen(START_FEN), depth)).toBe(nodes);
  });

  it.each([
    [1, 48],
    [2, 2039],
    [3, 97862],
  ])("kiwipete depth %i = %i", (depth, nodes) => {
    expect(perft(Position.fromFen(KIWIPETE), depth)).toBe(nodes);
  });

  // Well known positions that stress en passant pins, promotions and castling edge cases.
  it.each([
    ["8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", 4, 43238],
    ["r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", 3, 9467],
    ["rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", 3, 62379],
    ["r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", 3, 89890],
  ])("%s depth %i = %i", (fen, depth, nodes) => {
    expect(perft(Position.fromFen(fen), depth)).toBe(nodes);
  });
});

describe("make and unmake", () => {
  it("restores FEN and hash after every move at depth 2 of kiwipete", () => {
    const position = Position.fromFen(KIWIPETE);
    const fen = position.toFen();
    const hash = position.hashKey();
    for (const move of position.legalMoves()) {
      position.makeMove(move);
      for (const reply of position.legalMoves()) {
        position.makeMove(reply);
        position.unmakeMove();
      }
      position.unmakeMove();
      expect(position.toFen()).toBe(fen);
      expect(position.hashKey()).toBe(hash);
    }
  });

  it("incremental hash matches a hash computed from scratch", () => {
    const position = Position.fromFen(KIWIPETE);
    for (const move of position.legalMoves()) {
      position.makeMove(move);
      expect(position.hashKey()).toBe(Position.fromFen(position.toFen()).hashKey());
      position.unmakeMove();
    }
  });
});

const legal = (position: Position, uci: string): number => {
  const move = position.parseUci(uci);
  if (move === null) throw new Error(`${uci} should be legal`);
  return move;
};

describe("special moves", () => {
  const uciMoves = (fen: string): string[] =>
    Position.fromFen(fen).legalMoves().map(moveToUci).sort();

  it("castles both ways when the path is clear and safe", () => {
    const moves = uciMoves("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    expect(moves).toContain("e1g1");
    expect(moves).toContain("e1c1");
  });

  it("does not castle out of check", () => {
    const moves = uciMoves("r3k2r/8/8/8/4r3/8/8/R3K2R w KQkq - 0 1");
    expect(moves).not.toContain("e1g1");
    expect(moves).not.toContain("e1c1");
  });

  it("does not castle through an attacked square", () => {
    const moves = uciMoves("r3k2r/8/8/8/5r2/8/8/R3K2R w KQkq - 0 1");
    expect(moves).not.toContain("e1g1");
    expect(moves).toContain("e1c1");
  });

  it("allows queenside castling when only b1 is attacked", () => {
    expect(uciMoves("r3k2r/8/8/8/1r6/8/8/R3K2R w KQkq - 0 1")).toContain("e1c1");
  });

  it("does not castle into check", () => {
    expect(uciMoves("r3k2r/8/8/8/6r1/8/8/R3K2R w KQkq - 0 1")).not.toContain("e1g1");
  });

  it("does not castle through a piece", () => {
    expect(uciMoves("r3k2r/8/8/8/8/8/8/RN2K2R w KQkq - 0 1")).not.toContain("e1c1");
  });

  it("loses castling rights when the rook is captured", () => {
    const position = Position.fromFen("r3k2r/8/8/8/8/8/6b1/R3K2R b KQkq - 0 1");
    position.makeMove(legal(position, "g2h1"));
    expect(position.toFen().split(" ")[2]).toBe("Qkq");
  });

  it("captures en passant and removes the captured pawn", () => {
    const position = Position.fromFen("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
    position.makeMove(legal(position, "e5d6"));
    expect(position.toFen()).toBe("4k3/8/3P4/8/8/8/8/4K3 b - - 0 1");
  });

  it("refuses en passant that exposes the king along the rank", () => {
    expect(uciMoves("8/8/8/K2pP2r/8/8/8/7k w - d6 0 1")).not.toContain("e5d6");
  });

  it("offers all four promotions", () => {
    const moves = uciMoves("8/P6k/8/8/8/8/8/K7 w - - 0 1").filter((m) => m.startsWith("a7a8"));
    expect(moves).toEqual(["a7a8b", "a7a8n", "a7a8q", "a7a8r"]);
  });

  it("promotes to the chosen piece", () => {
    const position = Position.fromFen("8/P6k/8/8/8/8/8/K7 w - - 0 1");
    position.makeMove(legal(position, "a7a8n"));
    expect(position.toFen()).toBe("N7/7k/8/8/8/8/8/K7 b - - 0 1");
  });

  it("returns null when parsing an illegal UCI move", () => {
    const position = Position.fromFen(START_FEN);
    expect(position.parseUci("e2e5")).toBeNull();
    expect(position.parseUci("e7e8q")).toBeNull();
    expect(position.parseUci("zz")).toBeNull();
  });
});
