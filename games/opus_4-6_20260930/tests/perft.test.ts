import { describe, it, expect } from "vitest";
import { ChessGame } from "../src/chess/game.js";

describe("perft from starting position", () => {
  it("depth 1 = 20", () => {
    const g = new ChessGame();
    expect(g.perft(1)).toBe(20);
  });

  it("depth 2 = 400", () => {
    const g = new ChessGame();
    expect(g.perft(2)).toBe(400);
  });

  it("depth 3 = 8902", () => {
    const g = new ChessGame();
    expect(g.perft(3)).toBe(8902);
  });

  it("depth 4 = 197281", () => {
    const g = new ChessGame();
    expect(g.perft(4)).toBe(197281);
  });
});

describe("perft from kiwipete", () => {
  const kiwipete =
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -";

  it("depth 1 = 48", () => {
    const g = new ChessGame(kiwipete);
    expect(g.perft(1)).toBe(48);
  });

  it("depth 2 = 2039", () => {
    const g = new ChessGame(kiwipete);
    expect(g.perft(2)).toBe(2039);
  });

  it("depth 3 = 97862", () => {
    const g = new ChessGame(kiwipete);
    expect(g.perft(3)).toBe(97862);
  });
});

describe("perft position 3 (en passant pin)", () => {
  const pos3 = "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - -";

  it("depth 1 = 14", () => {
    const g = new ChessGame(pos3);
    expect(g.perft(1)).toBe(14);
  });

  it("depth 2 = 191", () => {
    const g = new ChessGame(pos3);
    expect(g.perft(2)).toBe(191);
  });

  it("depth 3 = 2812", () => {
    const g = new ChessGame(pos3);
    expect(g.perft(3)).toBe(2812);
  });
});

describe("perft position 4 (promotions)", () => {
  const pos4 =
    "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq -";

  it("depth 1 = 6", () => {
    const g = new ChessGame(pos4);
    expect(g.perft(1)).toBe(6);
  });

  it("depth 2 = 264", () => {
    const g = new ChessGame(pos4);
    expect(g.perft(2)).toBe(264);
  });

  it("depth 3 = 9467", () => {
    const g = new ChessGame(pos4);
    expect(g.perft(3)).toBe(9467);
  });
});

describe("perft position 5", () => {
  const pos5 =
    "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ -";

  it("depth 1 = 44", () => {
    const g = new ChessGame(pos5);
    expect(g.perft(1)).toBe(44);
  });

  it("depth 2 = 1486", () => {
    const g = new ChessGame(pos5);
    expect(g.perft(2)).toBe(1486);
  });

  it("depth 3 = 62379", () => {
    const g = new ChessGame(pos5);
    expect(g.perft(3)).toBe(62379);
  });
});
