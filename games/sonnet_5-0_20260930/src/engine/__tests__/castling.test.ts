import { describe, expect, it } from "vitest";
import { createGame, getLegalMoves, makeMove, toFen } from "../index";
import type { GameState, Move } from "../types";

function play(state: GameState, uciMoves: string[]): GameState {
  let current = state;
  for (const uci of uciMoves) {
    const move: Move = {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length === 5 ? { promotion: uci[4] as "q" | "r" | "b" | "n" } : {}),
    };
    const result = makeMove(current, move);
    if (!result) throw new Error(`Expected ${uci} to be legal from ${toFen(current)}`);
    current = result.state;
  }
  return current;
}

describe("castling", () => {
  it("allows white kingside castling when the path is clear and safe", () => {
    const state = play(createGame(), ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6"]);
    const moves = getLegalMoves(state);
    expect(moves).toContainEqual({ from: "e1", to: "g1" });
    const result = makeMove(state, { from: "e1", to: "g1" });
    expect(result).not.toBeNull();
    // King e1->g1, rook h1->f1: back rank becomes RNBQ1RK1.
    expect(toFen(result!.state).split(" ")[0]).toContain("RNBQ1RK1");
  });

  it("allows white queenside castling when the path is clear and safe", () => {
    const state = createGame(
      "r3kbnr/pppqpppp/2n5/3p1b2/3P1B2/2N5/PPPQPPPP/R3KBNR w KQkq -",
    );
    const result = makeMove(state, { from: "e1", to: "c1" });
    expect(result).not.toBeNull();
    // King e1->c1, rook a1->d1: back rank becomes 2KR1BNR.
    expect(toFen(result!.state).split(" ")[0]).toContain("2KR1BNR");
  });

  it("allows black kingside and queenside castling", () => {
    const kingsideFen = "rnbqk2r/ppppbppp/5n2/4p3/4P3/5N2/PPPPBPPP/RNBQK2R b KQkq -";
    const ks = makeMove(createGame(kingsideFen), { from: "e8", to: "g8" });
    expect(ks).not.toBeNull();

    const queensideFen = "r3kbnr/pppqpppp/2n5/3p1b2/3P1B2/2N5/PPPQPPPP/R3KBNR b KQkq -";
    const qs = makeMove(createGame(queensideFen), { from: "e8", to: "c8" });
    expect(qs).not.toBeNull();
  });

  it("forbids castling out of check", () => {
    // White king on e1 in check from a black rook on e8 (open e-file).
    const fen = "4r3/8/8/8/8/8/8/R3K2R w KQ -";
    const moves = getLegalMoves(createGame(fen));
    expect(moves).not.toContainEqual({ from: "e1", to: "g1" });
    expect(moves).not.toContainEqual({ from: "e1", to: "c1" });
  });

  it("forbids castling through an attacked square", () => {
    // Black rook on f8 attacks f1, the kingside transit square.
    const fen = "5r2/8/8/8/8/8/8/R3K2R w KQ -";
    const moves = getLegalMoves(createGame(fen));
    expect(moves).not.toContainEqual({ from: "e1", to: "g1" });
    // Queenside should still be legal.
    expect(moves).toContainEqual({ from: "e1", to: "c1" });
  });

  it("forbids castling into check", () => {
    // Black rook on g8 attacks g1, the kingside destination square.
    const fen = "6r1/8/8/8/8/8/8/R3K2R w KQ -";
    const moves = getLegalMoves(createGame(fen));
    expect(moves).not.toContainEqual({ from: "e1", to: "g1" });
  });

  it("revokes castling rights when the king moves", () => {
    const state = play(createGame(), ["e2e4", "e7e5", "e1e2", "e8e7"]);
    expect(toFen(state).split(" ")[2]).toBe("-");
  });

  it("revokes only the relevant side's rights when a rook moves", () => {
    const state = play(createGame(), ["a2a4", "a7a5", "a1a3", "a8a6"]);
    const castling = toFen(state).split(" ")[2];
    expect(castling).toBe("Kk");
  });

  it("revokes castling rights when a rook is captured", () => {
    // White knight on g6 is one move from capturing black's h8 rook.
    const fen = "r3k2r/8/6N1/8/8/8/8/R3K3 w KQkq -";
    const state = createGame(fen);
    expect(toFen(state).split(" ")[2]).toBe("KQkq");

    const afterCapture = makeMove(state, { from: "g6", to: "h8" });
    expect(afterCapture).not.toBeNull();
    expect(afterCapture!.isCapture).toBe(true);
    // Black's kingside rook is gone, so black loses kingside rights only.
    expect(toFen(afterCapture!.state).split(" ")[2]).toBe("KQq");
  });
});
