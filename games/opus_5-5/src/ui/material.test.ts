import { describe, expect, it } from "vitest";
import { ChessGame } from "@/chess/game";
import { materialBalance } from "./material";

const afterMoves = (ucis: string[], fen?: string): ChessGame => {
  const game = new ChessGame(fen);
  for (const uci of ucis) game.play(uci);
  return game;
};

describe("materialBalance", () => {
  it("is level with nothing captured at the start", () => {
    const game = new ChessGame();
    expect(materialBalance(game.pieces(), game.history())).toEqual({
      capturedByWhite: [],
      capturedByBlack: [],
      advantage: 0,
    });
  });

  it("lists captures per side and the material lead from White's view", () => {
    // 1.e4 d5 2.exd5 Qxd5 3.Nc3 Qxg2? 4.Bxg2
    const game = afterMoves(["e2e4", "d7d5", "e4d5", "d8d5", "b1c3", "d5g2", "f1g2"]);
    const balance = materialBalance(game.pieces(), game.history());
    expect(balance.capturedByWhite).toEqual(["q", "p"]);
    expect(balance.capturedByBlack).toEqual(["p", "p"]);
    expect(balance.advantage).toBe(8);
  });

  it("counts promotions in the advantage", () => {
    const game = afterMoves(["a7a8q"], "4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
    expect(materialBalance(game.pieces(), game.history()).advantage).toBe(9);
  });

  it("records both sides of a trade", () => {
    const game = afterMoves(["d1d8", "e8d8"], "3rk3/8/8/8/8/8/8/3QK3 w - - 0 1");
    const balance = materialBalance(game.pieces(), game.history());
    expect(balance.capturedByWhite).toEqual(["r"]);
    expect(balance.capturedByBlack).toEqual(["q"]);
    expect(balance.advantage).toBe(0);
  });
});
