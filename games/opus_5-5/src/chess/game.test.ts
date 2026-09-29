import { describe, expect, it } from "vitest";
import { ChessGame } from "./game";

const playAll = (game: ChessGame, ucis: string[]): void => {
  for (const uci of ucis) game.play(uci);
};

describe("ChessGame SAN", () => {
  it.each([
    ["pawn push", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "e2e4", "e4"],
    ["knight move", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "g1f3", "Nf3"],
    ["pawn capture", "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", "e4d5", "exd5"],
    ["kingside castle", "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "e1g1", "O-O"],
    ["queenside castle", "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "e1c1", "O-O-O"],
    ["en passant", "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3", "e5f6", "exf6"],
    ["promotion with check", "3k4/4P3/8/8/8/8/8/4K3 w - - 0 1", "e7e8q", "e8=Q+"],
    ["under-promotion", "8/4P3/8/8/8/8/8/k3K3 w - - 0 1", "e7e8n", "e8=N"],
    ["file disambiguation", "4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1", "b1d2", "Nbd2"],
    ["rank disambiguation", "4k3/8/8/R7/8/8/8/R3K3 w - - 0 1", "a1a3", "R1a3"],
    ["square disambiguation", "1k6/8/8/8/4Q2Q/8/8/K6Q w - - 0 1", "h4e1", "Qh4e1"],
    ["checkmate", "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2", "d8h4", "Qh4#"],
  ])("formats %s", (_name, fen, uci, san) => {
    const game = new ChessGame(fen);
    expect(game.play(uci).san).toBe(san);
  });
});

describe("ChessGame moves", () => {
  it("lists legal moves from a square", () => {
    const game = new ChessGame();
    const targets = game.legalMovesFrom("e2").map((move) => move.to);
    expect(targets.sort()).toEqual(["e3", "e4"]);
  });

  it("returns no moves for an empty or enemy square", () => {
    const game = new ChessGame();
    expect(game.legalMovesFrom("e4")).toEqual([]);
    expect(game.legalMovesFrom("e7")).toEqual([]);
  });

  it("marks promotion moves", () => {
    const game = new ChessGame("8/P7/8/8/8/8/8/k6K w - - 0 1");
    const promotions = game.legalMovesFrom("a7").map((move) => move.promotion);
    expect(promotions.sort()).toEqual(["b", "n", "q", "r"]);
  });

  it("throws on an illegal move", () => {
    expect(() => new ChessGame().play("e2e5")).toThrow(/illegal/i);
  });

  it("records history with captures and colour", () => {
    const game = new ChessGame();
    playAll(game, ["e2e4", "d7d5", "e4d5"]);
    const last = game.history().at(-1);
    expect(last).toMatchObject({ san: "exd5", color: "w", piece: "p", captured: "p", from: "e4", to: "d5" });
    expect(game.history().map((move) => move.uci)).toEqual(["e2e4", "d7d5", "e4d5"]);
  });

  it("reports turn and pieces", () => {
    const game = new ChessGame();
    game.play("e2e4");
    expect(game.turn()).toBe("b");
    expect(game.pieces()).toHaveLength(32);
    expect(game.pieces()).toContainEqual({ square: "e4", color: "w", type: "p" });
  });

  it("finds the checked king square", () => {
    const game = new ChessGame("4k3/8/8/8/8/8/8/4K2r w - - 0 1");
    expect(game.checkedKingSquare()).toBe("e1");
    expect(new ChessGame().checkedKingSquare()).toBeNull();
  });
});

describe("ChessGame result", () => {
  it("is playing at the start", () => {
    expect(new ChessGame().result()).toEqual({ state: "playing" });
  });

  it("detects checkmate", () => {
    const game = new ChessGame();
    playAll(game, ["f2f3", "e7e5", "g2g4", "d8h4"]);
    expect(game.result()).toEqual({ state: "checkmate", winner: "b" });
  });

  it("detects stalemate", () => {
    expect(new ChessGame("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1").result()).toEqual({ state: "draw", reason: "stalemate" });
  });

  it("detects threefold repetition", () => {
    const game = new ChessGame();
    const cycle = ["g1f3", "g8f6", "f3g1", "f6g8"];
    playAll(game, cycle);
    expect(game.result().state).toBe("playing");
    playAll(game, cycle);
    expect(game.result()).toEqual({ state: "draw", reason: "threefold-repetition" });
  });

  it("detects the fifty-move rule", () => {
    const game = new ChessGame("4k3/8/8/8/8/8/8/R3K3 w - - 99 80");
    game.play("a1a2");
    expect(game.result()).toEqual({ state: "draw", reason: "fifty-move-rule" });
  });

  it("prefers checkmate over the fifty-move rule", () => {
    const game = new ChessGame("k7/8/1K6/8/8/8/8/7R w - - 99 80");
    game.play("h1h8");
    expect(game.result()).toEqual({ state: "checkmate", winner: "w" });
  });

  it("detects insufficient material", () => {
    const game = new ChessGame("8/8/8/4k3/3r4/8/8/3RK3 b - - 0 1");
    game.play("d4d1");
    game.play("e1d1");
    expect(game.result()).toEqual({ state: "draw", reason: "insufficient-material" });
  });
});
