import { describe, expect, it } from "vitest";
import { Game, hasInsufficientMaterial } from "./game";
import { BLACK, Position, START_FEN, WHITE } from "./position";

const playAll = (game: Game, moves: string[]): void => {
  for (const move of moves) game.play(move);
};

describe("SAN", () => {
  it("records pawn, piece and capture moves", () => {
    const game = new Game();
    playAll(game, ["e2e4", "d7d5", "e4d5", "g8f6", "b1c3"]);
    expect(game.moves.map((m) => m.san)).toEqual(["e4", "d5", "exd5", "Nf6", "Nc3"]);
  });

  it("records castling", () => {
    const game = new Game("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    playAll(game, ["e1g1", "e8c8"]);
    expect(game.moves.map((m) => m.san)).toEqual(["O-O", "O-O-O"]);
  });

  it("disambiguates by file, rank and both", () => {
    expect(new Game("4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1").play("b1d2").san).toBe("Nbd2");
    expect(new Game("4k3/8/8/8/R7/8/8/R3K3 w - - 0 1").play("a1a2").san).toBe("R1a2");
    expect(new Game("4k3/8/8/8/8/Q7/8/Q1Q1K3 w - - 0 1").play("a1b2").san).toBe("Qa1b2");
  });

  it("marks promotion, check and mate", () => {
    expect(new Game("7k/P7/8/8/8/8/8/K7 w - - 0 1").play("a7a8q").san).toBe("a8=Q+");
    expect(new Game("7k/P7/6K1/8/8/8/8/8 w - - 0 1").play("a7a8r").san).toBe("a8=R#");
  });

  it("marks en passant as a pawn capture", () => {
    expect(new Game("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1").play("e5d6").san).toBe("exd6");
  });
});

describe("game end", () => {
  it("detects checkmate (fool's mate)", () => {
    const game = new Game();
    playAll(game, ["f2f3", "e7e5", "g2g4", "d8h4"]);
    expect(game.status()).toEqual({ result: "0-1", reason: "checkmate", inCheck: true });
    expect(game.moves[3].san).toBe("Qh4#");
  });

  it("detects stalemate", () => {
    const game = new Game("7k/8/8/6Q1/8/8/8/K7 w - - 0 1");
    game.play("g5g6");
    expect(game.status()).toEqual({ result: "1/2-1/2", reason: "stalemate", inCheck: false });
  });

  it("detects threefold repetition on the third occurrence", () => {
    const game = new Game();
    playAll(game, ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1"]);
    expect(game.status().result).toBe("*");
    game.play("f6g8");
    expect(game.status()).toEqual({ result: "1/2-1/2", reason: "threefold", inCheck: false });
  });

  it("ignores an en passant right that cannot legally be used when comparing positions", () => {
    // After e2e4 the d4 pawn is pinned to its king by the d1 rook, so the e3 en passant
    // square gives black no extra option and the position counts as a repeat of later ones.
    const game = new Game("1n1k4/8/8/8/3p4/8/4P3/1N1R3K w - - 0 1");
    playAll(game, ["e2e4", "b8c6", "b1a3", "c6b8", "a3b1", "b8c6", "b1a3", "c6b8"]);
    expect(game.status().result).toBe("*");
    game.play("a3b1");
    expect(game.status().reason).toBe("threefold");
  });

  it("detects the fifty-move rule", () => {
    const game = new Game("4k3/8/8/8/8/8/8/4K2R w - - 99 80");
    expect(game.status().result).toBe("*");
    game.play("h1h2");
    expect(game.status()).toEqual({ result: "1/2-1/2", reason: "fifty-move", inCheck: false });
  });

  it("prefers checkmate over the fifty-move rule", () => {
    const game = new Game("7k/8/6K1/8/8/8/8/R7 w - - 99 80");
    game.play("a1a8");
    expect(game.status().reason).toBe("checkmate");
  });

  it("detects insufficient material after a capture", () => {
    const game = new Game("4k3/8/8/8/8/8/3r4/4K3 w - - 0 1");
    game.play("e1d2");
    expect(game.status()).toEqual({ result: "1/2-1/2", reason: "insufficient", inCheck: false });
  });

  it("records resignation", () => {
    const game = new Game();
    game.play("e2e4");
    game.resign(WHITE);
    expect(game.status()).toEqual({ result: "0-1", reason: "resignation", inCheck: false });
    expect(() => game.play("e7e5")).toThrow();
  });

  it("refuses illegal moves and moves after the game ends", () => {
    const game = new Game();
    expect(() => game.play("e2e5")).toThrow(/not legal/);
    playAll(game, ["f2f3", "e7e5", "g2g4", "d8h4"]);
    expect(() => game.play("a2a3")).toThrow();
  });
});

describe("insufficient material", () => {
  it.each([
    ["4k3/8/8/8/8/8/8/4K3 w - - 0 1", true],
    ["4k3/8/8/8/8/8/8/2B1K3 w - - 0 1", true],
    ["4k3/8/8/8/8/8/8/1N2K3 w - - 0 1", true],
    ["2b1k3/8/8/8/8/8/8/2B1K3 w - - 0 1", false],
    ["3bk3/8/8/8/8/8/8/2B1K3 w - - 0 1", true],
    ["4k3/8/8/8/8/8/8/1NN1K3 w - - 0 1", false],
    ["4k3/8/8/8/8/8/8/1n2K1N1 w - - 0 1", false],
    ["4k3/8/8/8/8/8/4P3/4K3 w - - 0 1", false],
    ["4k3/8/8/8/8/8/8/3RK3 w - - 0 1", false],
  ])("%s -> %s", (fen, expected) => {
    expect(hasInsufficientMaterial(Position.fromFen(fen))).toBe(expected);
  });
});

describe("history", () => {
  it("keeps the FEN before and after every move for review", () => {
    const game = new Game();
    playAll(game, ["e2e4", "e7e5"]);
    expect(game.fenAt(0)).toBe(START_FEN);
    expect(game.fenAt(2)).toBe(game.position.toFen());
    expect(game.moves[0].color).toBe(WHITE);
    expect(game.moves[1].color).toBe(BLACK);
  });
});
