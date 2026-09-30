import { describe, it, expect } from "vitest";
import { Game, isInsufficientMaterial } from "../src/engine/game.js";
import { parseFen } from "../src/engine/fen.js";
import { uciOfMove } from "../src/engine/moves.js";

function playAll(g: Game, moves: string[]): void {
  for (const m of moves) {
    const r = g.makeUci(m);
    if (!r) throw new Error(`illegal move ${m} in test`);
  }
}

describe("castling", () => {
  it("white kingside", () => {
    const g = new Game("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const r = g.makeUci("e1g1");
    expect(r).not.toBeNull();
    expect(g.position.board[6]).toBe("K"); // g1
    expect(g.position.board[5]).toBe("R"); // f1
  });
  it("black queenside", () => {
    const g = new Game("r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1");
    const r = g.makeUci("e8c8");
    expect(r).not.toBeNull();
    expect(g.position.board[58]).toBe("k"); // c8
    expect(g.position.board[59]).toBe("r"); // d8
  });
  it("cannot castle out of check", () => {
    // Black rook on e2 checks white king; kingside castling should be illegal.
    const g = new Game("4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1");
    expect(g.makeUci("e1g1")).toBeNull();
  });
  it("cannot castle through attacked square", () => {
    // Rook on f5 attacks f1; kingside castling illegal.
    const g = new Game("4k3/8/8/5r2/8/8/8/R3K2R w KQ - 0 1");
    expect(g.makeUci("e1g1")).toBeNull();
  });
});

describe("en passant", () => {
  it("basic capture", () => {
    const g = new Game();
    playAll(g, ["e2e4", "a7a6", "e4e5", "d7d5"]);
    // now white can en passant on d6
    const r = g.makeUci("e5d6");
    expect(r).not.toBeNull();
    expect(g.position.board[35]).toBeNull(); // d5 captured pawn removed
    expect(g.position.board[43]).toBe("P");  // d6
  });
  it("ep square only lives one ply", () => {
    const g = new Game();
    playAll(g, ["e2e4", "a7a6", "e4e5", "d7d5", "a2a3"]);
    // black can no longer play e5d6 with a black pawn (this is white's ep window; irrelevant),
    // but importantly the ep target is cleared after any move.
    expect(g.position.epTarget).toBeNull();
  });
});

describe("promotion", () => {
  it("promotes to a queen", () => {
    const g = new Game("8/P7/8/8/8/8/8/4k2K w - - 0 1");
    const r = g.makeUci("a7a8q");
    expect(r).not.toBeNull();
    expect(g.position.board[56]).toBe("Q");
  });
  it("all four promotion pieces available", () => {
    const g = new Game("8/P7/8/8/8/8/8/4k2K w - - 0 1");
    const promos = g.legalMoves().filter(m => m.from === 48).map(m => m.promo);
    expect(promos.sort()).toEqual(["b", "n", "q", "r"]);
  });
});

describe("checkmate and stalemate", () => {
  it("fools mate is checkmate", () => {
    const g = new Game();
    playAll(g, ["f2f3", "e7e5", "g2g4", "d8h4"]);
    const end = g.endState();
    expect(end.over).toBe(true);
    expect(end.result).toBe("0-1");
    expect(end.reason).toBe("checkmate");
  });
  it("recognizes stalemate", () => {
    // Classic king stalemate: black king h8, white king f7, white queen g6 — but need to move to trigger.
    // Instead set up the actual stalemate position with black to move (no legal moves, not in check).
    const g = new Game("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    const end = g.endState();
    expect(end.over).toBe(true);
    expect(end.reason).toBe("stalemate");
    expect(end.result).toBe("1/2-1/2");
  });
});

describe("threefold repetition", () => {
  it("draws on threefold", () => {
    const g = new Game();
    // Knights shuffle
    playAll(g, ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"]);
    const end = g.endState();
    expect(end.over).toBe(true);
    expect(end.reason).toBe("threefold");
  });
});

describe("fifty-move rule", () => {
  it("draws when halfmoveClock >= 100", () => {
    const g = new Game("4k3/8/8/8/8/8/8/4K3 w - - 100 60");
    const end = g.endState();
    expect(end.over).toBe(true);
    expect(end.reason).toBe("fifty");
  });
});

describe("insufficient material", () => {
  it("K vs K", () => {
    expect(isInsufficientMaterial(parseFen("4k3/8/8/8/8/8/8/4K3 w - - 0 1"))).toBe(true);
  });
  it("K+B vs K", () => {
    expect(isInsufficientMaterial(parseFen("4k3/8/8/8/8/8/8/4KB2 w - - 0 1"))).toBe(true);
  });
  it("K+N vs K", () => {
    expect(isInsufficientMaterial(parseFen("4k3/8/8/8/8/8/8/4KN2 w - - 0 1"))).toBe(true);
  });
  it("K+B vs K+B same color bishops", () => {
    // Both bishops on light squares (c1 and f8 are same color? c1 is dark; use two light-square bishops).
    // f1 is light, c8 is light.
    expect(isInsufficientMaterial(parseFen("2b1k3/8/8/8/8/8/8/4KB2 w - - 0 1"))).toBe(true);
  });
  it("K+R vs K is NOT insufficient", () => {
    expect(isInsufficientMaterial(parseFen("4k3/8/8/8/8/8/8/4KR2 w - - 0 1"))).toBe(false);
  });
  it("K+B vs K+B opposite color bishops NOT insufficient", () => {
    // f1 bishop is light, c1 bishop is dark. Use black bishop on c8 (light) vs white on c1 (dark).
    expect(isInsufficientMaterial(parseFen("2b1k3/8/8/8/8/8/8/2B1K3 w - - 0 1"))).toBe(false);
  });
});

describe("move generation basics", () => {
  it("start position has 20 moves", () => {
    const g = new Game();
    expect(g.legalMoves().length).toBe(20);
  });
  it("uciOfMove roundtrip", () => {
    const g = new Game();
    const mv = g.legalMoves().find(m => uciOfMove(m) === "e2e4");
    expect(mv).toBeDefined();
  });
});
