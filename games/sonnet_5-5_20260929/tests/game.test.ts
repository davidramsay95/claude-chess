import { describe, expect, it } from "vitest";
import { Game } from "../src/engine/game";
import { START_FEN } from "../src/engine/position";

const play = (game: Game, moves: string[]): void => {
  for (const move of moves) {
    if (!game.playUci(move)) throw new Error(`illegal move ${move}`);
  }
};

describe("Game rules", () => {
  it("starts ongoing with 20 legal moves", () => {
    const game = new Game(START_FEN);
    expect(game.status()).toEqual({ result: "*", reason: "ongoing" });
    expect(game.legalUci()).toHaveLength(20);
  });

  it("rejects illegal moves without changing the game", () => {
    const game = new Game(START_FEN);
    expect(game.playUci("e2e5")).toBe(false);
    expect(game.moves).toEqual([]);
  });

  it("detects fool's mate as a black win", () => {
    const game = new Game(START_FEN);
    play(game, ["f2f3", "e7e5", "g2g4", "d8h4"]);
    expect(game.status()).toEqual({ result: "0-1", reason: "checkmate" });
  });

  it("detects stalemate", () => {
    const game = new Game("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(game.status()).toEqual({ result: "1/2-1/2", reason: "stalemate" });
  });

  it("allows castling on both sides", () => {
    const game = new Game("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    expect(game.legalUci()).toEqual(expect.arrayContaining(["e1g1", "e1c1"]));
    play(game, ["e1g1"]);
    expect(game.position.toFen()).toBe("r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1");
    // The rook that just castled now covers f8, so only the queenside remains.
    expect(game.legalUci()).toContain("e8c8");
    expect(game.legalUci()).not.toContain("e8g8");
  });

  it("forbids castling through an attacked square", () => {
    const game = new Game("r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1");
    expect(game.legalUci()).not.toContain("e1g1");
    expect(game.legalUci()).toContain("e1c1");
  });

  it("forbids castling out of check", () => {
    const game = new Game("r3k2r/8/8/8/8/8/4r3/R3K2R w KQkq - 0 1");
    expect(game.legalUci()).not.toContain("e1g1");
    expect(game.legalUci()).not.toContain("e1c1");
  });

  it("allows queenside castling when only the rook passes an attacked square", () => {
    const game = new Game("r3k2r/8/8/8/8/8/1r6/R3K2R w KQkq - 0 1");
    expect(game.legalUci()).toContain("e1c1");
  });

  it("loses castling rights after the rook moves", () => {
    const game = new Game("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    play(game, ["h1h2", "a8a7", "h2h1", "a7a8"]);
    expect(game.legalUci()).not.toContain("e1g1");
    expect(game.legalUci()).toContain("e1c1");
  });

  it("performs en passant only immediately after the double push", () => {
    const game = new Game(START_FEN);
    play(game, ["e2e4", "a7a6", "e4e5", "d7d5"]);
    expect(game.legalUci()).toContain("e5d6");
    play(game, ["e5d6"]);
    expect(game.position.toFen().split(" ")[0]).toBe("rnbqkbnr/1pp1pppp/p2P4/8/8/8/PPPP1PPP/RNBQKBNR");

    const later = new Game(START_FEN);
    play(later, ["e2e4", "a7a6", "e4e5", "d7d5", "h2h3", "a6a5"]);
    expect(later.legalUci()).not.toContain("e5d6");
  });

  it("does not allow en passant that exposes the king", () => {
    const game = new Game("8/8/8/KPp4r/8/8/8/7k w - c6 0 1");
    expect(game.legalUci()).not.toContain("b5c6");
  });

  it("offers all four promotion pieces", () => {
    const game = new Game("8/P7/8/8/8/8/k6K/8 w - - 0 1");
    const moves = game.legalUci().filter((m) => m.startsWith("a7"));
    expect(moves.sort()).toEqual(["a7a8b", "a7a8n", "a7a8q", "a7a8r"]);
    play(game, ["a7a8n"]);
    expect(game.position.toFen().split(" ")[0]).toBe("N7/8/8/8/8/8/k6K/8");
  });

  it("detects threefold repetition", () => {
    const game = new Game(START_FEN);
    play(game, ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1"]);
    expect(game.status().result).toBe("*");
    play(game, ["f6g8"]);
    expect(game.status()).toEqual({ result: "1/2-1/2", reason: "threefold repetition" });
  });

  it("detects the fifty-move rule", () => {
    const game = new Game("4k3/8/8/8/8/8/8/R3K3 w - - 99 80");
    expect(game.status().result).toBe("*");
    play(game, ["a1a2"]);
    expect(game.status()).toEqual({ result: "1/2-1/2", reason: "fifty-move rule" });
  });

  it("prefers checkmate over the fifty-move rule", () => {
    const game = new Game("7k/8/6K1/8/8/8/8/R7 w - - 99 80");
    play(game, ["a1a8"]);
    expect(game.status()).toEqual({ result: "1-0", reason: "checkmate" });
  });

  it.each([
    ["4k3/8/8/8/8/8/8/4K3 w - - 0 1", true],
    ["4k3/8/8/8/8/8/8/3BK3 w - - 0 1", true],
    ["4k3/8/8/8/8/8/8/3NK3 w - - 0 1", true],
    ["4k3/8/8/8/8/8/8/2B1KB2 w - - 0 1", false],
    ["2b1k3/8/8/8/8/8/8/3BK3 w - - 0 1", true],
    ["4kb2/8/8/8/8/8/8/3BK3 w - - 0 1", false],
    ["4k3/8/8/8/8/8/8/2NNK3 w - - 0 1", false],
    ["4k3/8/8/8/8/8/P7/4K3 w - - 0 1", false],
    ["4k3/8/8/8/8/8/8/3RK3 w - - 0 1", false],
  ])("insufficient material for %s is %s", (fen, expected) => {
    const game = new Game(fen);
    expect(game.status().reason === "insufficient material").toBe(expected);
  });
});
