import { describe, expect, it } from "vitest";
import { Board, sq0x88 } from "../src/engine/board.ts";
import { generateLegal } from "../src/engine/movegen.ts";
import { moveToUci, parseUci } from "../src/engine/notation.ts";
import {
  isInsufficientMaterial,
  isStalemate,
} from "../src/engine/rules.ts";
import { pieceType, QUEEN } from "../src/engine/types.ts";
import { Game } from "../src/game/game.ts";

function uciSet(board: Board): Set<string> {
  return new Set(generateLegal(board).map(moveToUci));
}

describe("castling", () => {
  it("offers both castles when the path is clear", () => {
    const board = Board.fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const moves = uciSet(board);
    expect(moves.has("e1g1")).toBe(true);
    expect(moves.has("e1c1")).toBe(true);
  });

  it("forbids castling through an attacked square", () => {
    // Black rook on f2 attacks f1, so the king may not cross it kingside.
    const board = Board.fromFen("4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1");
    const moves = uciSet(board);
    expect(moves.has("e1g1")).toBe(false);
    expect(moves.has("e1c1")).toBe(true);
  });

  it("moves the rook when the king castles", () => {
    const board = Board.fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const move = parseUci(board, "e1g1")!;
    board.make(move);
    expect(pieceType(board.squares[sq0x88(5, 0)])).toBe(4); // rook now on f1
    expect(board.squares[sq0x88(7, 0)]).toBe(0); // h1 empty
  });
});

describe("en passant", () => {
  it("captures the pawn that just double-stepped", () => {
    const game = new Game("white", "medium");
    for (const uci of ["e2e4", "a7a6", "e4e5", "d7d5"]) {
      expect(game.applyUci(uci)).toBe(true);
    }
    expect(game.applyUci("e5d6")).toBe(true); // en passant
    const board = game.boardAt(game.moveCount);
    expect(board.squares[sq0x88(3, 4)]).toBe(0); // captured pawn d5 gone
    expect(board.squares[sq0x88(3, 5)]).not.toBe(0); // white pawn on d6
  });
});

describe("promotion", () => {
  it("offers all four promotion pieces", () => {
    const board = Board.fromFen("8/P7/8/8/8/8/8/4k1K1 w - - 0 1");
    const promos = generateLegal(board)
      .filter((m) => m.from === sq0x88(0, 6))
      .map(moveToUci)
      .sort();
    expect(promos).toEqual(["a7a8b", "a7a8n", "a7a8q", "a7a8r"]);
  });

  it("places the chosen promotion piece", () => {
    const board = Board.fromFen("8/P7/8/8/8/8/8/4k1K1 w - - 0 1");
    const move = parseUci(board, "a7a8q")!;
    board.make(move);
    expect(pieceType(board.squares[sq0x88(0, 7)])).toBe(QUEEN);
  });
});

describe("checkmate and stalemate", () => {
  it("detects Fool's mate as a black win", () => {
    const game = new Game("white", "medium");
    for (const uci of ["f2f3", "e7e5", "g2g4", "d8h4"]) game.applyUci(uci);
    const status = game.status();
    expect(status.reason).toBe("checkmate");
    expect(status.result).toBe("0-1");
    expect(status.isOver).toBe(true);
  });

  it("detects stalemate", () => {
    const board = Board.fromFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(isStalemate(board)).toBe(true);
    expect(board.inCheck()).toBe(false);
  });
});

describe("draw conditions", () => {
  it("recognises insufficient material", () => {
    expect(isInsufficientMaterial(Board.fromFen("4k3/8/8/8/8/8/8/4K3 w - - 0 1"))).toBe(true);
    expect(isInsufficientMaterial(Board.fromFen("4k3/8/8/8/8/8/8/3BK3 w - - 0 1"))).toBe(true);
    expect(isInsufficientMaterial(Board.fromFen("4k3/8/8/8/8/8/8/3NK3 w - - 0 1"))).toBe(true);
    expect(isInsufficientMaterial(Board.fromFen("4k3/8/8/8/8/8/8/3RK3 w - - 0 1"))).toBe(false);
    expect(isInsufficientMaterial(Board.fromFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"))).toBe(false);
  });

  it("recognises threefold repetition", () => {
    const game = new Game("white", "medium");
    const dance = ["g1f3", "g8f6", "f3g1", "f6g8"];
    for (let i = 0; i < 2; i++) for (const uci of dance) game.applyUci(uci);
    expect(game.isThreefold()).toBe(true);
    expect(game.status().reason).toBe("threefold");
  });

  it("recognises the fifty-move rule", () => {
    const game = Game.fromState({
      version: 1,
      startFen: "4k3/8/8/8/8/8/4R3/4K3 w - - 100 1",
      playerColor: "white",
      difficulty: "medium",
      moves: [],
      resigned: false,
    });
    expect(game.status().reason).toBe("fifty-move");
    expect(game.status().result).toBe("1/2-1/2");
  });
});
