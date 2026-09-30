import { describe, it, expect } from "vitest";
import { Game } from "../src/engine/game.ts";
import { START_FEN, algebraic, moveToUci } from "../src/engine/position.ts";

function play(game: Game, ucis: string[]): Game {
  for (const uci of ucis) game.playUci(uci);
  return game;
}

describe("SAN", () => {
  it("names quiet moves, captures and checks", () => {
    const game = new Game();
    play(game, ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5c6", "d7c6", "e1g1"]);
    expect(game.moves.map((m) => m.san)).toEqual([
      "e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Bxc6", "dxc6", "O-O",
    ]);
  });

  it("marks check and checkmate", () => {
    const game = new Game();
    play(game, ["f2f3", "e7e5", "g2g4", "d8h4"]);
    expect(game.moves.at(-1)!.san).toBe("Qh4#");
    const check = new Game();
    play(check, ["e2e4", "e7e5", "d1h5", "b8c6", "f1c4", "g8f6", "h5f7"]);
    expect(check.moves.at(-1)!.san).toBe("Qxf7#");
  });

  it("names both castles and promotions", () => {
    const game = new Game("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    play(game, ["e1c1", "e8g8"]);
    expect(game.moves.map((m) => m.san)).toEqual(["O-O-O", "O-O"]);

    const promo = new Game("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
    promo.playUci("a7a8n");
    expect(promo.moves[0].san).toBe("a8=N");
    const promoCapture = new Game("1n2k3/P7/8/8/8/8/8/4K3 w - - 0 1");
    promoCapture.playUci("a7b8q");
    expect(promoCapture.moves[0].san).toBe("axb8=Q+");
  });

  it("disambiguates by file, by rank and by both", () => {
    const byFile = new Game("4k3/8/8/8/8/4N3/8/N3K3 w - - 0 1");
    byFile.playUci("a1c2");
    expect(byFile.moves[0].san).toBe("Nac2");

    const byRank = new Game("4k3/8/8/R7/8/8/8/R3K3 w - - 0 1");
    byRank.playUci("a1a3");
    expect(byRank.moves[0].san).toBe("R1a3");

    const byBoth = new Game("8/1k6/8/8/Q6Q/8/8/Q3K3 w - - 0 1");
    byBoth.playUci("a4d4");
    expect(byBoth.moves[0].san).toBe("Qa4d4");
  });
});

describe("castling rules", () => {
  it("allows castling when the path is clear", () => {
    const game = new Game("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1");
    game.playUci("e1g1");
    expect(game.position.toFen()).toBe("4k3/8/8/8/8/8/8/R4RK1 b - - 1 1");
  });

  it("forbids castling through an attacked square", () => {
    const game = new Game("4k3/8/8/8/8/8/6r1/R3K2R w KQ - 0 1");
    const uci = game.legalMoveUcis();
    expect(uci).not.toContain("e1g1");
    expect(uci).toContain("e1c1");
  });

  it("forbids castling out of check and into check", () => {
    const outOf = new Game("4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1");
    expect(outOf.legalMoveUcis()).not.toContain("e1g1");
    expect(outOf.legalMoveUcis()).not.toContain("e1c1");

    const into = new Game("4k3/8/8/8/8/8/6r1/R3K2R w KQ - 0 1");
    expect(into.legalMoveUcis()).not.toContain("e1g1");
  });

  it("lets the queen's rook pass an attacked b1 square", () => {
    const game = new Game("4k3/8/8/8/8/8/1r6/R3K2R w KQ - 0 1");
    expect(game.legalMoveUcis()).toContain("e1c1");
  });

  it("drops the right once the king or rook has moved", () => {
    const game = new Game("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1");
    play(game, ["h1g1", "e8e7", "g1h1", "e7e8"]);
    expect(game.legalMoveUcis()).not.toContain("e1g1");
    expect(game.legalMoveUcis()).toContain("e1c1");
  });

  it("drops the right when the rook is captured on its home square", () => {
    const game = new Game("4k3/6b1/8/8/8/8/8/R3K2R b KQ - 0 1");
    game.playUci("g7a1");
    expect(game.position.castling).toBe(1); // only white king-side survives
  });
});

describe("en passant", () => {
  it("captures the passed pawn and removes it from the board", () => {
    const game = new Game();
    play(game, ["e2e4", "a7a6", "e4e5", "d7d5", "e5d6"]);
    expect(game.moves.at(-1)!.san).toBe("exd6");
    expect(game.position.pieceTypeAt(0x43)).toBe(0); // d5 is empty again
    expect(game.position.toFen()).toBe("rnbqkbnr/1pp1pppp/p2P4/8/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3");
  });

  it("expires if not taken immediately", () => {
    const game = new Game();
    play(game, ["e2e4", "a7a6", "e4e5", "d7d5", "a2a3", "a6a5"]);
    expect(game.legalMoveUcis()).not.toContain("e5d6");
  });

  it("is illegal when it would expose our own king", () => {
    const game = new Game("8/8/8/K2pP2q/8/8/8/7k w - d6 0 1");
    expect(game.legalMoveUcis()).not.toContain("e5d6");
  });
});

describe("game endings", () => {
  it("detects checkmate", () => {
    const game = new Game();
    play(game, ["f2f3", "e7e5", "g2g4", "d8h4"]);
    expect(game.status()).toMatchObject({ over: true, result: "0-1", reason: "checkmate" });
  });

  it("detects stalemate", () => {
    const game = new Game("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(game.status()).toMatchObject({ over: true, result: "1/2-1/2", reason: "stalemate" });
  });

  it("detects threefold repetition", () => {
    const game = new Game();
    expect(game.status().over).toBe(false);
    play(game, ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1"]);
    expect(game.status().over).toBe(false);
    game.playUci("f6g8");
    expect(game.status()).toMatchObject({ over: true, result: "1/2-1/2", reason: "threefold repetition" });
  });

  it("detects the fifty-move rule", () => {
    const game = new Game("4k3/8/8/8/8/8/8/R3K3 w - - 99 60");
    expect(game.status().over).toBe(false);
    game.playUci("a1a2");
    expect(game.position.halfmoveClock).toBe(100);
    expect(game.status()).toMatchObject({ over: true, result: "1/2-1/2", reason: "fifty-move rule" });
  });

  it("detects insufficient material", () => {
    const cases: Array<[string, boolean]> = [
      ["8/8/4k3/8/8/4K3/8/8 w - - 0 1", true],
      ["8/8/4k3/8/8/4K3/8/5B2 w - - 0 1", true],
      ["8/8/4k3/8/8/4K3/8/5N2 w - - 0 1", true],
      ["5b2/8/4k3/8/8/4K3/8/2B5 w - - 0 1", true],
      ["4b3/8/4k3/8/8/4K3/8/2B5 w - - 0 1", false],
      ["8/8/4k3/8/8/4K3/8/5NN1 w - - 0 1", false],
      ["8/8/4k3/8/8/4K3/8/5R2 w - - 0 1", false],
      ["8/8/4k3/8/8/4K3/4P3/8 w - - 0 1", false],
    ];
    for (const [fen, expected] of cases) {
      expect(new Game(fen).isInsufficientMaterial(), fen).toBe(expected);
    }
    expect(new Game("8/8/4k3/8/8/4K3/8/5B2 w - - 0 1").status()).toMatchObject({
      over: true,
      result: "1/2-1/2",
      reason: "insufficient material",
    });
  });

  it("records a resignation for the side that resigned", () => {
    const game = new Game();
    game.playUci("e2e4");
    game.resign("white");
    expect(game.status()).toMatchObject({ over: true, result: "0-1", reason: "resignation" });
  });
});

describe("history", () => {
  it("rejects an illegal UCI move without changing anything", () => {
    const game = new Game();
    const fen = game.position.toFen();
    expect(() => game.playUci("e2e5")).toThrow();
    expect(() => game.playUci("zzzz")).toThrow();
    expect(game.position.toFen()).toBe(fen);
    expect(game.moves.length).toBe(0);
  });

  it("undoes back to the exact previous position", () => {
    const game = new Game();
    const fens = [game.position.toFen()];
    for (const uci of ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4"]) {
      game.playUci(uci);
      fens.push(game.position.toFen());
    }
    while (game.moves.length) {
      game.undo();
      expect(game.position.toFen()).toBe(fens[game.moves.length]);
    }
    expect(game.position.toFen()).toBe(START_FEN);
  });

  it("exposes a FEN and a UCI list that match the move records", () => {
    const game = new Game();
    play(game, ["d2d4", "d7d5", "c2c4"]);
    expect(game.uciMoves()).toEqual(["d2d4", "d7d5", "c2c4"]);
    expect(game.moves.map((m) => m.fenAfter).at(-1)).toBe(game.position.toFen());
  });

  it("lists legal moves as UCI strings that round-trip", () => {
    const game = new Game();
    const fromMoves = game.position.legalMoves().map(moveToUci).sort();
    expect(game.legalMoveUcis().slice().sort()).toEqual(fromMoves);
    expect(algebraic(0)).toBe("a1");
  });
});
