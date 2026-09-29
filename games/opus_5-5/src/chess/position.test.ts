import { describe, expect, it } from "vitest";
import { Position, START_FEN } from "./position";
import { moveToUci } from "./move";

/** Counts leaf nodes of the legal move tree; the canonical movegen correctness check. */
const perft = (position: Position, depth: number): number => {
  const moves = position.generateLegalMoves();
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (const move of moves) {
    position.makeMove(move);
    nodes += perft(position, depth - 1);
    position.unmakeMove();
  }
  return nodes;
};

// Reference counts from https://www.chessprogramming.org/Perft_Results
const PERFT_CASES: ReadonlyArray<{ name: string; fen: string; counts: number[] }> = [
  { name: "start position", fen: START_FEN, counts: [20, 400, 8902, 197281] },
  {
    name: "kiwipete",
    fen: "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    counts: [48, 2039, 97862],
  },
  { name: "position 3", fen: "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", counts: [14, 191, 2812, 43238] },
  {
    name: "position 4",
    fen: "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
    counts: [6, 264, 9467],
  },
  {
    name: "position 5",
    fen: "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
    counts: [44, 1486, 62379],
  },
  {
    name: "position 6",
    fen: "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
    counts: [46, 2079, 89890],
  },
];

describe("Position move generation (perft)", () => {
  for (const { name, fen, counts } of PERFT_CASES) {
    counts.forEach((expected, index) => {
      it(`${name} depth ${index + 1} = ${expected}`, () => {
        expect(perft(Position.fromFen(fen), index + 1)).toBe(expected);
      });
    });
  }
});

describe("Position FEN", () => {
  it("round-trips the start position", () => {
    expect(Position.fromFen(START_FEN).toFen()).toBe(START_FEN);
  });

  it("round-trips a position with an en passant square", () => {
    const fen = "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3";
    expect(Position.fromFen(fen).toFen()).toBe(fen);
  });

  it("omits the en passant square when no pawn can capture", () => {
    const position = Position.fromFen(START_FEN);
    position.makeMove(position.parseUci("e2e4"));
    expect(position.toFen()).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
  });

  it("rejects malformed FEN", () => {
    expect(() => Position.fromFen("not a fen")).toThrow();
  });
});

describe("Position make/unmake", () => {
  it("restores FEN and hash after unmaking every move", () => {
    const position = Position.fromFen(PERFT_CASES[1].fen);
    const fen = position.toFen();
    const hash = position.hashKey();
    for (const move of position.generateLegalMoves()) {
      position.makeMove(move);
      position.unmakeMove();
      expect(position.toFen()).toBe(fen);
      expect(position.hashKey()).toBe(hash);
    }
  });

  it("produces the same hash for the same position reached by different move orders", () => {
    const a = Position.fromFen(START_FEN);
    for (const uci of ["g1f3", "g8f6", "b1c3", "b8c6"]) a.makeMove(a.parseUci(uci));
    const b = Position.fromFen(START_FEN);
    for (const uci of ["b1c3", "b8c6", "g1f3", "g8f6"]) b.makeMove(b.parseUci(uci));
    expect(a.hashKey()).toBe(b.hashKey());
  });

  it("matches the hash of a freshly parsed FEN after moves", () => {
    const position = Position.fromFen(START_FEN);
    for (const uci of ["e2e4", "d7d5", "e4e5", "f7f5", "e5f6"]) position.makeMove(position.parseUci(uci));
    expect(position.hashKey()).toBe(Position.fromFen(position.toFen()).hashKey());
  });
});

describe("Position special moves", () => {
  it("castles kingside moving both king and rook", () => {
    const position = Position.fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    position.makeMove(position.parseUci("e1g1"));
    expect(position.toFen()).toBe("r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1");
  });

  it("forbids castling through an attacked square", () => {
    const position = Position.fromFen("r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1");
    const ucis = position.generateLegalMoves().map(moveToUci);
    expect(ucis).not.toContain("e1g1");
  });

  it("forbids castling out of check", () => {
    const position = Position.fromFen("r3k2r/8/8/8/8/8/4r3/R3K2R w KQkq - 0 1");
    const ucis = position.generateLegalMoves().map(moveToUci);
    expect(ucis).not.toContain("e1g1");
    expect(ucis).not.toContain("e1c1");
  });

  it("captures en passant removing the passed pawn", () => {
    const position = Position.fromFen("rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3");
    position.makeMove(position.parseUci("e5f6"));
    expect(position.toFen()).toBe("rnbqkbnr/ppp1p1pp/5P2/3p4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3");
  });

  it("offers all four promotion pieces", () => {
    const position = Position.fromFen("8/P7/8/8/8/8/8/k6K w - - 0 1");
    const promotions = position
      .generateLegalMoves()
      .map(moveToUci)
      .filter((uci) => uci.startsWith("a7a8"));
    expect(promotions.sort()).toEqual(["a7a8b", "a7a8n", "a7a8q", "a7a8r"]);
  });

  it("loses castling rights when a rook is captured", () => {
    const position = Position.fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    position.makeMove(position.parseUci("a1a8"));
    expect(position.toFen().split(" ")[2]).toBe("Kk");
  });
});

describe("Position state queries", () => {
  it("detects check", () => {
    expect(Position.fromFen("4k3/8/8/8/8/8/8/4K2r w - - 0 1").inCheck()).toBe(true);
    expect(Position.fromFen(START_FEN).inCheck()).toBe(false);
  });

  it.each([
    ["K vs K", "8/8/8/4k3/8/8/8/4K3 w - - 0 1", true],
    ["K+N vs K", "8/8/8/4k3/8/8/8/3NK3 w - - 0 1", true],
    ["K+B vs K", "8/8/8/4k3/8/8/8/3BK3 w - - 0 1", true],
    ["K+B vs K+B same colour", "8/8/8/3bk3/8/8/8/3BK3 w - - 0 1", true],
    ["K+B vs K+B opposite colour", "8/8/8/2b1k3/8/8/8/3BK3 w - - 0 1", false],
    ["K+N+N vs K", "8/8/8/4k3/8/8/8/2NNK3 w - - 0 1", false],
    ["K+P vs K", "8/8/8/4k3/8/8/3P4/4K3 w - - 0 1", false],
    ["K+R vs K", "8/8/8/4k3/8/8/8/3RK3 w - - 0 1", false],
  ])("insufficient material: %s", (_name, fen, expected) => {
    expect(Position.fromFen(fen).isInsufficientMaterial()).toBe(expected);
  });

  it("counts repetitions of the current position", () => {
    const position = Position.fromFen(START_FEN);
    const cycle = ["g1f3", "g8f6", "f3g1", "f6g8"];
    for (const uci of cycle) position.makeMove(position.parseUci(uci));
    expect(position.repetitionCount()).toBe(2);
    for (const uci of cycle) position.makeMove(position.parseUci(uci));
    expect(position.repetitionCount()).toBe(3);
  });

  it("returns 0 from parseUci for an illegal move", () => {
    const position = Position.fromFen(START_FEN);
    expect(position.parseUci("e2e5")).toBe(0);
  });
});
