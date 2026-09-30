import { describe, it, expect } from "vitest";
import { Game } from "../src/engine/game.ts";
import { pairMoves } from "../src/ui/movelist.ts";

describe("move list rows", () => {
  it("is empty for a fresh game", () => {
    expect(pairMoves(new Game())).toEqual([]);
  });

  it("pairs white and black moves under one number", () => {
    const game = new Game();
    for (const uci of ["e2e4", "c7c5", "g1f3"]) game.playUci(uci);
    expect(pairMoves(game)).toEqual([
      { number: 1, white: { san: "e4", index: 0 }, black: { san: "c5", index: 1 } },
      { number: 2, white: { san: "Nf3", index: 2 }, black: null },
    ]);
  });

  it("leaves a gap when the game starts with Black to move", () => {
    const game = new Game("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1");
    for (const uci of ["c7c5", "g1f3"]) game.playUci(uci);
    expect(pairMoves(game)).toEqual([
      { number: 1, white: null, black: { san: "c5", index: 0 } },
      { number: 2, white: { san: "Nf3", index: 1 }, black: null },
    ]);
  });

  it("keeps numbering from a start position with a later move number", () => {
    const game = new Game("4k3/8/8/8/8/8/8/4K3 w - - 0 17");
    for (const uci of ["e1e2", "e8e7"]) game.playUci(uci);
    expect(pairMoves(game).map((row) => row.number)).toEqual([17]);
  });
});
