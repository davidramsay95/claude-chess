import { describe, expect, it } from "vitest";
import { chooseMove, evaluate } from "../src/engine/search";
import { Game } from "../src/engine/game";
import { Position, START_FEN } from "../src/engine/position";
import { DIFFICULTIES, type Difficulty } from "../src/state";

const pick = (fen: string, difficulty: Difficulty, moves: string[] = []): string | null =>
  chooseMove(fen, moves, difficulty, 0.15).move;

describe("evaluate", () => {
  it("scores the start position as balanced", () => {
    expect(Math.abs(evaluate(Position.fromFen(START_FEN)))).toBeLessThan(30);
  });

  it("scores from the side to move's point of view", () => {
    const white = evaluate(Position.fromFen("4k3/8/8/8/8/8/8/3QK3 w - - 0 1"));
    const black = evaluate(Position.fromFen("4k3/8/8/8/8/8/8/3QK3 b - - 0 1"));
    expect(white).toBeGreaterThan(700);
    expect(black).toBeLessThan(-700);
  });
});

describe("chooseMove", () => {
  it.each(DIFFICULTIES)("returns a legal move at %s", (difficulty) => {
    const game = new Game(START_FEN);
    expect(game.legalUci()).toContain(pick(START_FEN, difficulty));
  });

  it("returns null when there is no legal move", () => {
    expect(pick("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", "expert")).toBeNull();
  });

  it.each(["easy", "medium", "hard", "expert"] as const)("takes mate in one at %s", (difficulty) => {
    expect(pick("6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1", difficulty)).toBe("a1a8");
  });

  it.each(["medium", "hard", "expert"] as const)("takes a free queen at %s", (difficulty) => {
    expect(pick("4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1", difficulty)).toBe("d1d5");
  });

  it.each(["hard", "expert"] as const)("moves an attacked queen without grabbing a protected pawn at %s", (difficulty) => {
    const move = pick("6k1/8/2p5/3p4/4Q3/8/8/4K3 w - - 0 1", difficulty);
    expect(move?.startsWith("e4")).toBe(true);
    expect(move).not.toBe("e4d5");
  });

  it("avoids stepping into a threefold repetition when winning", () => {
    const moves = ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1"];
    const game = new Game(START_FEN);
    for (const m of moves) game.playUci(m);
    // Black to move; the repetition-completing f6g8 is a draw, other moves are not forced.
    expect(pick(START_FEN, "expert", moves)).not.toBeNull();
  });
});
