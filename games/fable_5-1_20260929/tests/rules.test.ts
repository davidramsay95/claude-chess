import { describe, expect, it } from "vitest";
import { Game } from "../src/engine/game";
import { moveToUci } from "../src/engine/move";

const uciSet = (game: Game): Set<string> => new Set(game.legalMoves().map(moveToUci));

const play = (game: Game, moves: string): Game => {
  for (const uci of moves.split(/\s+/).filter(Boolean)) {
    if (!game.playUci(uci)) throw new Error(`Test setup: ${uci} is not legal in ${game.fen()}`);
  }
  return game;
};

describe("castling", () => {
  it("allows both sides when the path is clear and safe", () => {
    const game = Game.fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const moves = uciSet(game);
    expect(moves.has("e1g1")).toBe(true);
    expect(moves.has("e1c1")).toBe(true);
  });

  it("moves the rook as well as the king", () => {
    const game = play(Game.fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"), "e1g1");
    expect(game.fen()).toBe("r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1");
  });

  it("is refused when the king is in check", () => {
    const game = Game.fromFen("r3k2r/8/8/8/8/8/4r3/R3K2R w KQkq - 0 1");
    expect(uciSet(game).has("e1g1")).toBe(false);
    expect(uciSet(game).has("e1c1")).toBe(false);
  });

  it("is refused when the king would pass through an attacked square", () => {
    const game = Game.fromFen("r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1");
    const moves = uciSet(game);
    expect(moves.has("e1g1")).toBe(false);
    expect(moves.has("e1c1")).toBe(true);
  });

  it("is refused when the destination is attacked", () => {
    const game = Game.fromFen("r3k2r/8/8/8/8/8/6r1/R3K2R w KQkq - 0 1");
    expect(uciSet(game).has("e1g1")).toBe(false);
  });

  it("is allowed when only the queen's rook path square b1 is attacked", () => {
    const game = Game.fromFen("r3k2r/8/8/8/8/8/1r6/R3K2R w KQkq - 0 1");
    expect(uciSet(game).has("e1c1")).toBe(true);
  });

  it("loses the right after the king moves and returns", () => {
    const game = play(Game.fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"), "e1e2 e8e7 e2e1 e7e8");
    expect(uciSet(game).has("e1g1")).toBe(false);
    expect(game.fen()).toContain(" - ");
  });

  it("loses only the matching side's right when a rook is captured", () => {
    const game = play(Game.fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"), "a1a8");
    expect(game.fen()).toBe("R3k2r/8/8/8/8/8/8/4K2R b Kk - 0 1");
  });
});

describe("en passant", () => {
  it("is offered right after a double push and captures the pawn", () => {
    const game = play(Game.fromFen("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1"), "");
    expect(uciSet(game).has("e5d6")).toBe(true);
    play(game, "e5d6");
    expect(game.fen()).toBe("4k3/8/3P4/8/8/8/8/4K3 b - - 0 1");
  });

  it("is only available on the very next move", () => {
    const game = play(Game.fromFen("4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1"), "d7d5 e1e2 e8e7");
    expect(uciSet(game).has("e5d6")).toBe(false);
  });

  it("is refused when it would expose the king", () => {
    const game = play(Game.fromFen("8/8/8/8/k2p3R/8/4P3/4K3 w - - 0 1"), "e2e4");
    expect(uciSet(game).has("d4e3")).toBe(false);
  });
});

describe("promotion", () => {
  it("offers all four pieces", () => {
    const game = Game.fromFen("4k3/1P6/8/8/8/8/8/4K3 w - - 0 1");
    const moves = uciSet(game);
    expect(moves.has("b7b8q")).toBe(true);
    expect(moves.has("b7b8r")).toBe(true);
    expect(moves.has("b7b8b")).toBe(true);
    expect(moves.has("b7b8n")).toBe(true);
    expect(moves.has("b7b8")).toBe(false);
  });

  it("places the chosen piece, also when capturing", () => {
    const game = play(Game.fromFen("2r1k3/1P6/8/8/8/8/8/4K3 w - - 0 1"), "b7c8n");
    expect(game.fen()).toBe("2N1k3/8/8/8/8/8/8/4K3 b - - 0 1");
    expect(game.sanHistory()).toEqual(["bxc8=N"]);
  });
});

describe("game end", () => {
  it("detects checkmate", () => {
    const game = play(Game.fromStart(), "f2f3 e7e5 g2g4 d8h4");
    expect(game.status().kind).toBe("checkmate");
    expect(game.result()).toBe("0-1");
    expect(game.sanHistory()).toEqual(["f3", "e5", "g4", "Qh4#"]);
    expect(game.legalMoves()).toHaveLength(0);
  });

  it("detects stalemate", () => {
    const game = Game.fromFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(game.status().kind).toBe("stalemate");
    expect(game.result()).toBe("1/2-1/2");
  });

  it("detects threefold repetition", () => {
    const game = play(Game.fromStart(), "g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8");
    expect(game.status().kind).toBe("repetition");
    expect(game.result()).toBe("1/2-1/2");
  });

  it("does not call repetition when castling rights differ", () => {
    const game = play(Game.fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"), "e1e2 e8e7 e2e1 e7e8 e1e2 e8e7 e2e1 e7e8");
    expect(game.status().kind).not.toBe("repetition");
  });

  it("detects the fifty-move rule", () => {
    const game = Game.fromFen("4k3/8/8/8/8/8/8/R3K3 w Q - 99 60");
    expect(game.status().kind).toBe("playing");
    play(game, "a1b1");
    expect(game.status().kind).toBe("fifty-move");
    expect(game.result()).toBe("1/2-1/2");
  });

  it("prefers checkmate over the fifty-move rule", () => {
    const game = Game.fromFen("6k1/8/6K1/8/8/8/8/R7 w - - 99 60");
    play(game, "a1a8");
    expect(game.status().kind).toBe("checkmate");
  });

  it.each([
    ["4k3/8/8/8/8/8/8/4K3 w - - 0 1", "king v king"],
    ["4k3/8/8/8/8/8/8/4KB2 w - - 0 1", "king and bishop v king"],
    ["4k3/8/8/8/8/8/8/4KN2 w - - 0 1", "king and knight v king"],
    ["2b1k3/8/8/8/8/8/8/4KB2 w - - 0 1", "bishops on the same colour"],
  ])("detects insufficient material: %s (%s)", (fen) => {
    expect(Game.fromFen(fen).status().kind).toBe("insufficient-material");
  });

  it.each([
    ["4k3/8/8/8/8/8/8/4KR2 w - - 0 1", "rook"],
    ["4k3/8/8/8/8/8/8/3NKN2 w - - 0 1", "two knights"],
    ["3bk3/8/8/8/8/8/8/4KB2 w - - 0 1", "bishops on opposite colours"],
    ["4k3/8/8/8/8/8/4P3/4K3 w - - 0 1", "a pawn"],
  ])("does not call insufficient material with %s", (fen) => {
    expect(Game.fromFen(fen).status().kind).toBe("playing");
  });

  it("reports resignation as a loss for the resigning colour", () => {
    const game = Game.fromStart();
    game.resign("white");
    expect(game.result()).toBe("0-1");
    expect(game.status().kind).toBe("resigned");
    expect(game.legalMoves()).toHaveLength(0);
  });
});

describe("history", () => {
  it("records SAN with disambiguation, checks and castling", () => {
    const game = play(
      Game.fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"),
      "e1g1 e8c8 a1d1 d8d1 f1d1 h8d8",
    );
    expect(game.sanHistory()).toEqual(["O-O", "O-O-O", "Rad1", "Rxd1", "Rxd1", "Rd8"]);
    expect(game.uciHistory()).toEqual(["e1g1", "e8c8", "a1d1", "d8d1", "f1d1", "h8d8"]);
  });

  it("can undo the last move", () => {
    const game = play(Game.fromStart(), "e2e4 e7e5");
    game.undo();
    expect(game.uciHistory()).toEqual(["e2e4"]);
    expect(game.fen()).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
  });

  it("refuses illegal UCI moves without changing anything", () => {
    const game = Game.fromStart();
    const before = game.fen();
    expect(game.playUci("e2e5")).toBe(false);
    expect(game.playUci("zz")).toBe(false);
    expect(game.playUci("e7e8q")).toBe(false);
    expect(game.fen()).toBe(before);
  });

  it("returns the position after any number of half-moves", () => {
    const game = play(Game.fromStart(), "e2e4 e7e5 g1f3");
    expect(game.fenAt(0)).toBe(Game.fromStart().fen());
    expect(game.fenAt(2)).toBe("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2");
    expect(game.fenAt(3)).toBe(game.fen());
  });
});
