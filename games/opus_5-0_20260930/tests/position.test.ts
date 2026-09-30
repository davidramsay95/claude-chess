import { describe, it, expect } from "vitest";
import {
  Position,
  START_FEN,
  algebraic,
  squareFromAlgebraic,
  moveFrom,
  moveTo,
  movePromotion,
  moveToUci,
  WHITE,
  BLACK,
  PAWN,
  KNIGHT,
  BISHOP,
  ROOK,
  QUEEN,
  KING,
} from "../src/engine/position.ts";

describe("square helpers", () => {
  it("round-trips every algebraic square", () => {
    for (const file of "abcdefgh") {
      for (const rank of "12345678") {
        const name = `${file}${rank}`;
        expect(algebraic(squareFromAlgebraic(name))).toBe(name);
      }
    }
  });

  it("rejects off-board names", () => {
    expect(squareFromAlgebraic("i1")).toBe(-1);
    expect(squareFromAlgebraic("a9")).toBe(-1);
    expect(squareFromAlgebraic("")).toBe(-1);
  });
});

describe("FEN", () => {
  it("parses the start position", () => {
    const pos = Position.fromFen(START_FEN);
    expect(pos.turn).toBe(WHITE);
    expect(pos.castling).toBe(0b1111);
    expect(pos.epSquare).toBe(-1);
    expect(pos.halfmoveClock).toBe(0);
    expect(pos.fullmoveNumber).toBe(1);
    expect(pos.pieceTypeAt(squareFromAlgebraic("e1"))).toBe(KING);
    expect(pos.colorAt(squareFromAlgebraic("e1"))).toBe(WHITE);
    expect(pos.pieceTypeAt(squareFromAlgebraic("d8"))).toBe(QUEEN);
    expect(pos.colorAt(squareFromAlgebraic("d8"))).toBe(BLACK);
    expect(pos.pieceTypeAt(squareFromAlgebraic("b1"))).toBe(KNIGHT);
    expect(pos.pieceTypeAt(squareFromAlgebraic("c1"))).toBe(BISHOP);
    expect(pos.pieceTypeAt(squareFromAlgebraic("a1"))).toBe(ROOK);
    expect(pos.pieceTypeAt(squareFromAlgebraic("h2"))).toBe(PAWN);
    expect(pos.pieceTypeAt(squareFromAlgebraic("e4"))).toBe(0);
  });

  it("round-trips a selection of FENs", () => {
    const fens = [
      START_FEN,
      "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
      "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
      "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
      "4k3/8/8/8/8/8/8/4K2R b K - 13 42",
      "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3",
    ];
    for (const fen of fens) {
      expect(Position.fromFen(fen).toFen()).toBe(fen);
    }
  });

  it("tolerates a FEN with the clocks omitted", () => {
    const pos = Position.fromFen("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -");
    expect(pos.halfmoveClock).toBe(0);
    expect(pos.fullmoveNumber).toBe(1);
  });

  it("throws on malformed FEN", () => {
    expect(() => Position.fromFen("garbage")).toThrow();
    expect(() => Position.fromFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1")).toThrow();
    expect(() => Position.fromFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNX w KQkq - 0 1")).toThrow();
    expect(() => Position.fromFen("rnbqkbnr/pppppppp/9/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toThrow();
    expect(() => Position.fromFen("4k3/8/8/8/8/8/8/8 w - - 0 1")).toThrow(); // no white king
  });
});

describe("move encoding", () => {
  it("packs and unpacks from/to/promotion", () => {
    const pos = Position.fromFen("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
    const moves = pos.legalMoves().filter((m) => movePromotion(m) !== 0);
    expect(moves.length).toBe(4);
    const uci = moves.map(moveToUci).sort();
    expect(uci).toEqual(["a7a8b", "a7a8n", "a7a8q", "a7a8r"]);
    for (const m of moves) {
      expect(algebraic(moveFrom(m))).toBe("a7");
      expect(algebraic(moveTo(m))).toBe("a8");
    }
  });
});

describe("legal move generation", () => {
  it("gives 20 moves in the start position", () => {
    expect(Position.fromFen(START_FEN).legalMoves().length).toBe(20);
  });

  it("leaves a king in check only the moves that escape it", () => {
    const pos = Position.fromFen("4k3/8/8/8/8/8/4r3/4K3 w - - 0 1");
    const uci = pos.legalMoves().map(moveToUci).sort();
    expect(uci).toEqual(["e1d1", "e1e2", "e1f1"]);
  });

  it("does not let an absolutely pinned piece leave the pin ray", () => {
    const pos = Position.fromFen("4r2k/8/8/8/8/8/4N3/4K3 w - - 0 1");
    const uci = pos.legalMoves().map(moveToUci).sort();
    expect(uci).toEqual(["e1d1", "e1d2", "e1f1", "e1f2"]);
  });

  it("answers a double check with king moves only", () => {
    const pos = Position.fromFen("4k3/8/8/8/8/5n2/8/4K2r w - - 0 1");
    const uci = pos.legalMoves().map(moveToUci).sort();
    expect(uci).toEqual(["e1e2", "e1f2"]);
  });
});
