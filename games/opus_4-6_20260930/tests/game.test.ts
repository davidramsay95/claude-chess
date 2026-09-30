import { describe, it, expect } from "vitest";
import { ChessGame } from "../src/chess/game.js";

describe("castling", () => {
  it("white can castle kingside", () => {
    const g = new ChessGame(
      "r1bqkbnr/pppppppp/2n5/8/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -",
    );
    const moves = g.getLegalMoves();
    expect(moves.some((m) => m.from === 0x04 && m.to === 0x06)).toBe(false);

    const g2 = new ChessGame(
      "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq -",
    );
    const moves2 = g2.getLegalMoves();
    expect(moves2.some((m) => m.from === 0x04 && m.to === 0x06)).toBe(true);
  });

  it("cannot castle through check", () => {
    const g = new ChessGame(
      "r3k2r/8/8/8/8/6n1/8/R3K2R w KQkq -",
    );
    const moves = g.getLegalMoves();
    expect(moves.some((m) => m.from === 0x04 && m.to === 0x06)).toBe(false);
    expect(moves.some((m) => m.from === 0x04 && m.to === 0x02)).toBe(true);
  });

  it("cannot castle out of check", () => {
    const g = new ChessGame(
      "r1bqk2r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K2R b KQkq -",
    );
    const moves = g.getLegalMoves();
    const castleMoves = moves.filter(
      (m) => m.from === 0x74 && (m.to === 0x76 || m.to === 0x72),
    );
    expect(castleMoves.length).toBe(0);
  });

  it("castling rights removed after king move", () => {
    const g = new ChessGame(
      "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq -",
    );
    const ke1d1 = g.findMoveByUci("e1d1");
    expect(ke1d1).not.toBeNull();
    g.makeMove(ke1d1!);
    expect(g.state.castling & (1 | 2)).toBe(0);
  });

  it("castling rights removed after rook move", () => {
    const g = new ChessGame(
      "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq -",
    );
    const ra1b1 = g.findMoveByUci("a1b1");
    expect(ra1b1).not.toBeNull();
    g.makeMove(ra1b1!);
    expect(g.state.castling & 2).toBe(0);
    expect(g.state.castling & 1).toBe(1);
  });
});

describe("en passant", () => {
  it("white can capture en passant", () => {
    const g = new ChessGame(
      "rnbqkbnr/pppp1ppp/8/4pP2/8/8/PPPPP1PP/RNBQKBNR w KQkq e6",
    );
    const moves = g.getLegalMoves();
    const ep = moves.find((m) => m.from === 0x45 && m.to === 0x54);
    expect(ep).toBeDefined();
    expect(ep!.flags & 2).toBeTruthy();
  });

  it("black can capture en passant", () => {
    const g = new ChessGame(
      "rnbqkbnr/ppppp1pp/8/8/4Pp2/8/PPPP1PPP/RNBQKBNR b KQkq e3",
    );
    const moves = g.getLegalMoves();
    const ep = moves.find((m) => m.from === 0x35 && m.to === 0x24);
    expect(ep).toBeDefined();
  });

  it("en passant removes the captured pawn", () => {
    const g = new ChessGame(
      "rnbqkbnr/pppp1ppp/8/4pP2/8/8/PPPPP1PP/RNBQKBNR w KQkq e6",
    );
    const ep = g.findMoveByUci("f5e6");
    expect(ep).not.toBeNull();
    g.makeMove(ep!);
    expect(g.state.board[0x44]).toBe(0);
  });
});

describe("promotion", () => {
  it("generates all four promotion types", () => {
    const g = new ChessGame("8/4P3/8/8/8/8/8/4K2k w - -");
    const moves = g.getLegalMoves();
    const proms = moves.filter((m) => m.from === 0x64 && m.to === 0x74);
    expect(proms.length).toBe(4);
    const types = proms.map((m) => m.promotion).sort();
    expect(types).toEqual([2, 3, 4, 5]);
  });
});

describe("checkmate", () => {
  it("fool's mate", () => {
    const g = new ChessGame();
    g.makeMove(g.findMoveByUci("f2f3")!);
    g.makeMove(g.findMoveByUci("e7e5")!);
    g.makeMove(g.findMoveByUci("g2g4")!);
    g.makeMove(g.findMoveByUci("d8h4")!);
    expect(g.isCheckmate()).toBe(true);
    expect(g.getResult()).toBe("0-1");
  });

  it("scholar's mate", () => {
    const g = new ChessGame();
    g.makeMove(g.findMoveByUci("e2e4")!);
    g.makeMove(g.findMoveByUci("e7e5")!);
    g.makeMove(g.findMoveByUci("f1c4")!);
    g.makeMove(g.findMoveByUci("b8c6")!);
    g.makeMove(g.findMoveByUci("d1h5")!);
    g.makeMove(g.findMoveByUci("g8f6")!);
    g.makeMove(g.findMoveByUci("h5f7")!);
    expect(g.isCheckmate()).toBe(true);
    expect(g.getResult()).toBe("1-0");
  });
});

describe("stalemate", () => {
  it("detects stalemate", () => {
    const g = new ChessGame("k7/2Q5/1K6/8/8/8/8/8 b - -");
    expect(g.isStalemate()).toBe(true);
    expect(g.getResult()).toBe("1/2-1/2");
  });
});

describe("threefold repetition", () => {
  it("detects threefold repetition", () => {
    const g = new ChessGame();
    g.makeMove(g.findMoveByUci("g1f3")!);
    g.makeMove(g.findMoveByUci("g8f6")!);
    g.makeMove(g.findMoveByUci("f3g1")!);
    g.makeMove(g.findMoveByUci("f6g8")!);
    g.makeMove(g.findMoveByUci("g1f3")!);
    g.makeMove(g.findMoveByUci("g8f6")!);
    g.makeMove(g.findMoveByUci("f3g1")!);
    g.makeMove(g.findMoveByUci("f6g8")!);
    expect(g.isThreefoldRepetition()).toBe(true);
  });
});

describe("fifty-move rule", () => {
  it("detects fifty-move rule", () => {
    const g = new ChessGame("4k3/8/8/8/8/8/8/4K2R w K - 99 50");
    const m = g.findMoveByUci("h1h2");
    expect(m).not.toBeNull();
    g.makeMove(m!);
    expect(g.isFiftyMoveRule()).toBe(true);
  });
});

describe("insufficient material", () => {
  it("K vs K", () => {
    const g = new ChessGame("4k3/8/8/8/8/8/8/4K3 w - -");
    expect(g.isInsufficientMaterial()).toBe(true);
  });

  it("K+B vs K", () => {
    const g = new ChessGame("4k3/8/8/8/8/8/8/4KB2 w - -");
    expect(g.isInsufficientMaterial()).toBe(true);
  });

  it("K+N vs K", () => {
    const g = new ChessGame("4k3/8/8/8/8/8/8/4KN2 w - -");
    expect(g.isInsufficientMaterial()).toBe(true);
  });

  it("K+B vs K+B same color bishops", () => {
    const g = new ChessGame("4k1b1/8/8/8/8/8/8/4KB2 w - -");
    expect(g.isInsufficientMaterial()).toBe(true);
  });

  it("K+B vs K+B opposite color bishops is not insufficient", () => {
    const g = new ChessGame("4kb2/8/8/8/8/8/8/4KB2 w - -");
    expect(g.isInsufficientMaterial()).toBe(false);
  });

  it("K+R vs K is not insufficient", () => {
    const g = new ChessGame("4k3/8/8/8/8/8/8/4KR2 w - -");
    expect(g.isInsufficientMaterial()).toBe(false);
  });
});

describe("SAN generation", () => {
  it("pawn move", () => {
    const g = new ChessGame();
    const m = g.findMoveByUci("e2e4");
    expect(g.moveToSan(m!)).toBe("e4");
  });

  it("knight move", () => {
    const g = new ChessGame();
    const m = g.findMoveByUci("g1f3");
    expect(g.moveToSan(m!)).toBe("Nf3");
  });

  it("castling", () => {
    const g = new ChessGame(
      "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq -",
    );
    const m = g.findMoveByUci("e1g1");
    expect(g.moveToSan(m!)).toBe("O-O");
  });

  it("checkmate annotation", () => {
    const g = new ChessGame();
    g.makeMove(g.findMoveByUci("f2f3")!);
    g.makeMove(g.findMoveByUci("e7e5")!);
    g.makeMove(g.findMoveByUci("g2g4")!);
    const m = g.findMoveByUci("d8h4");
    expect(g.moveToSan(m!)).toBe("Qh4#");
  });
});

describe("UCI move parsing", () => {
  it("finds standard move", () => {
    const g = new ChessGame();
    const m = g.findMoveByUci("e2e4");
    expect(m).not.toBeNull();
  });

  it("finds promotion move", () => {
    const g = new ChessGame("8/4P3/8/8/8/8/8/4K2k w - -");
    const m = g.findMoveByUci("e7e8q");
    expect(m).not.toBeNull();
    expect(m!.promotion).toBe(5);
  });

  it("returns null for illegal move", () => {
    const g = new ChessGame();
    expect(g.findMoveByUci("e2e5")).toBeNull();
  });
});
