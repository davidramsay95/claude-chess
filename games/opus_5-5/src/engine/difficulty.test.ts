import { describe, expect, it } from "vitest";
import { moveToUci } from "../chess/move";
import { Position, START_FEN } from "../chess/position";
import type { Difficulty } from "./protocol";
import { chooseEngineMove, chooseMove, DIFFICULTY_SETTINGS, type DifficultySettings, searchLimitsFor } from "./difficulty";
import { Searcher } from "./search";
import { createSeededRandom } from "./seededRandom";

const searcher = new Searcher({ transpositionTableBits: 16 });
const SEEDS = Array.from({ length: 20 }, (_, index) => index + 1);
const LEVELS: readonly Difficulty[] = ["easy", "medium", "hard", "expert"];

/** Same behaviour as the real level but with a short clock so tests stay fast. */
const fast = (difficulty: Difficulty, timeLimitMs = 100): DifficultySettings => ({
  ...DIFFICULTY_SETTINGS[difficulty],
  timeLimitMs: Math.min(DIFFICULTY_SETTINGS[difficulty].timeLimitMs, timeLimitMs),
});

const movesChosen = (fen: string, settings: DifficultySettings, seeds: readonly number[] = SEEDS): string[] =>
  seeds.map((seed) => moveToUci(chooseEngineMove(Position.fromFen(fen), settings, searcher, createSeededRandom(seed))));

const countOf = (moves: readonly string[], move: string): number => moves.filter((played) => played === move).length;

const HANGING_QUEEN = "4k3/pp6/8/3q4/8/4N3/PP6/4K3 w - - 0 1";
const MATE_IN_ONE = "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1";
const MIDDLEGAME = "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10";

describe("difficulty settings", () => {
  it("give harder levels at least as much depth and time", () => {
    for (let index = 1; index < LEVELS.length; index++) {
      const easier = DIFFICULTY_SETTINGS[LEVELS[index - 1]];
      const harder = DIFFICULTY_SETTINGS[LEVELS[index]];
      expect(harder.maxDepth).toBeGreaterThanOrEqual(easier.maxDepth);
      expect(harder.timeLimitMs).toBeGreaterThanOrEqual(easier.timeLimitMs);
    }
  });

  it("only widen the candidate margin for strong levels during the opening", () => {
    expect(searchLimitsFor(DIFFICULTY_SETTINGS.expert, 0).candidateMargin).toBeGreaterThan(0);
    expect(searchLimitsFor(DIFFICULTY_SETTINGS.expert, 20).candidateMargin).toBe(0);
    expect(searchLimitsFor(DIFFICULTY_SETTINGS.hard, 20).candidateMargin).toBe(0);
  });
});

describe("chooseMove", () => {
  const candidates = [
    { move: 11, score: 50 },
    { move: 22, score: 45 },
    { move: 33, score: -100 },
  ];

  it("always plays the best candidate when the level has no randomness", () => {
    for (const seed of SEEDS) expect(chooseMove(candidates, DIFFICULTY_SETTINGS.expert, 30, createSeededRandom(seed))).toBe(11);
  });

  it("in the opening, varies between near-equal moves but rarely picks one at the edge of the margin", () => {
    const opening = [
      { move: 1, score: 20 },
      { move: 2, score: 20 },
      { move: 3, score: 8 },
    ];
    const picks = Array.from({ length: 200 }, (_, seed) => chooseMove(opening, DIFFICULTY_SETTINGS.hard, 0, createSeededRandom(seed)));
    expect(picks.filter((move) => move === 1).length).toBeGreaterThan(60);
    expect(picks.filter((move) => move === 2).length).toBeGreaterThan(60);
    expect(picks.filter((move) => move === 3).length).toBeLessThan(15);
  });

  it("is reproducible for a given random seed", () => {
    const pick = (): number => chooseMove(candidates, DIFFICULTY_SETTINGS.easy, 30, createSeededRandom(7));
    expect(pick()).toBe(pick());
  });
});

describe("easy", () => {
  it("still captures a hanging queen most of the time", () => {
    expect(countOf(movesChosen(HANGING_QUEEN, fast("easy")), "e3d5")).toBeGreaterThanOrEqual(16);
  });

  it("still plays mate in one most of the time", () => {
    expect(countOf(movesChosen(MATE_IN_ONE, fast("easy")), "d1d8")).toBeGreaterThanOrEqual(16);
  });

  it("varies its moves from game to game", () => {
    expect(new Set(movesChosen(MIDDLEGAME, fast("easy"))).size).toBeGreaterThan(3);
  });

  it("returns legal moves", () => {
    for (const fen of [START_FEN, MIDDLEGAME, "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1"]) {
      const legal = Position.fromFen(fen).generateLegalMoves().map(moveToUci);
      for (const move of movesChosen(fen, fast("easy"), SEEDS.slice(0, 5))) expect(legal).toContain(move);
    }
  });
});

describe("medium", () => {
  it("captures a hanging queen", () => {
    expect(countOf(movesChosen(HANGING_QUEEN, fast("medium"), SEEDS.slice(0, 5)), "e3d5")).toBe(5);
  });

  it("varies its moves between a few good options", () => {
    const moves = movesChosen(START_FEN, fast("medium"), SEEDS.slice(0, 10));
    expect(new Set(moves).size).toBeGreaterThan(1);
  });
});

describe("hard and expert", () => {
  it("vary their opening moves across games", () => {
    expect(new Set(movesChosen(START_FEN, fast("hard", 150), SEEDS.slice(0, 10))).size).toBeGreaterThan(1);
  });

  it("play the same best move every time once out of the opening", () => {
    const settings: DifficultySettings = { ...DIFFICULTY_SETTINGS.expert, maxDepth: 4 };
    expect(new Set(movesChosen(MIDDLEGAME, settings, SEEDS.slice(0, 5))).size).toBe(1);
  });

  it("find mate in one", () => {
    expect(movesChosen(MATE_IN_ONE, fast("expert"), [1])).toEqual(["d1d8"]);
  });
});
