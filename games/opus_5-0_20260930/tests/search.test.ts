import { describe, it, expect } from "vitest";
import { Game } from "../src/engine/game.ts";
import { DIFFICULTIES, type Difficulty } from "../src/engine/difficulty.ts";
import { MATE_THRESHOLD, createSearcher, type SearchResult } from "../src/engine/search.ts";

/** Deterministic generator so "random" levels are reproducible in tests. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function think(fen: string, difficulty: Difficulty, seed = 1): SearchResult {
  const game = new Game(fen);
  return createSearcher().think(game, difficulty, seededRandom(seed));
}

describe("search", () => {
  it.each(DIFFICULTIES)("%s finds mate in one", (difficulty) => {
    const result = think("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", difficulty);
    expect(result.uci).toBe("a1a8");
    expect(result.score).toBeGreaterThan(MATE_THRESHOLD);
  });

  it.each(DIFFICULTIES)("%s takes a free queen", (difficulty) => {
    const result = think("4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1", difficulty);
    expect(result.uci).toBe("e4d5");
  });

  it.each(DIFFICULTIES)("%s returns a legal move from the start position", (difficulty) => {
    const game = new Game();
    const result = createSearcher().think(game, difficulty, seededRandom(7));
    expect(game.legalMoveUcis()).toContain(result.uci);
    expect(result.nodes).toBeGreaterThan(0);
  });

  it.each(DIFFICULTIES)("%s answers a middlegame inside the five second budget", (difficulty) => {
    const fen = "r1bq1rk1/pp2ppbp/2np1np1/2p5/2P1P3/2N2NP1/PP1PBP1P/R1BQ1RK1 w - - 0 8";
    const started = Date.now();
    const result = think(fen, difficulty);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(5000);
    expect(new Game(fen).legalMoveUcis()).toContain(result.uci);
  });

  it.each(["hard", "expert"] as const)("%s sees a forced mate in two", (difficulty) => {
    const result = think("6k1/8/5K2/8/8/8/8/R7 w - - 0 1", difficulty);
    expect(result.score).toBeGreaterThan(MATE_THRESHOLD);
    const game = new Game("6k1/8/5K2/8/8/8/8/R7 w - - 0 1");
    game.playUci(result.uci);
    expect(game.status().over).toBe(false);
  });

  it("returns no move when the game is already over", () => {
    const mated = new Game("R5k1/5ppp/8/8/8/8/8/6K1 b - - 1 1");
    const result = createSearcher().think(mated, "expert", seededRandom(1));
    expect(result.move).toBe(0);
    expect(result.uci).toBe("");
  });

  it("is deterministic for a fixed seed", () => {
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3";
    const first = think(fen, "easy", 42);
    const second = think(fen, "easy", 42);
    expect(second.uci).toBe(first.uci);
  });

  it("searches deeper as the difficulty rises", () => {
    const fen = "r1bq1rk1/pp2ppbp/2np1np1/2p5/2P1P3/2N2NP1/PP1PBP1P/R1BQ1RK1 w - - 0 8";
    const easy = think(fen, "easy");
    const medium = think(fen, "medium");
    const hard = think(fen, "hard");
    const expert = think(fen, "expert");
    expect(medium.depth).toBeGreaterThan(easy.depth);
    expect(hard.depth).toBeGreaterThan(medium.depth);
    expect(expert.depth).toBeGreaterThanOrEqual(hard.depth);
    expect(expert.nodes).toBeGreaterThan(hard.nodes);
  });

  it("avoids a stalemate trap when it is winning easily", () => {
    // White must not play Qg6?? which stalemates; any other queen move wins.
    const result = think("7k/8/8/8/8/8/5Q2/6K1 w - - 0 1", "expert");
    const game = new Game("7k/8/8/8/8/8/5Q2/6K1 w - - 0 1");
    game.playUci(result.uci);
    expect(game.status().reason).not.toBe("stalemate");
  });

  it("reports a principal variation of legal moves", () => {
    const fen = "r1bq1rk1/pp2ppbp/2np1np1/2p5/2P1P3/2N2NP1/PP1PBP1P/R1BQ1RK1 w - - 0 8";
    const result = think(fen, "hard");
    expect(result.pv.length).toBeGreaterThan(1);
    const game = new Game(fen);
    for (const uci of result.pv) {
      expect(game.legalMoveUcis(), `${uci} in ${result.pv.join(" ")}`).toContain(uci);
      game.playUci(uci);
    }
  });
});
