import type { Move } from "../chess/move";
import type { Position } from "../chess/position";
import type { Difficulty } from "./protocol";
import type { ScoredMove, Searcher, SearchLimits } from "./search";
import type { Rng } from "./seededRandom";

/** How strongly and how predictably a level plays. Scores and margins are in centipawns. */
export interface DifficultySettings {
  maxDepth: number;
  timeLimitMs: number;
  /** Root moves within this margin of the best are scored exactly and may be chosen. */
  candidateMargin: number;
  /** Each candidate's score gets a uniform random bonus in [0, noise) and the highest total is played. */
  noise: number;
  /** Chance of ignoring the scores entirely and picking uniformly among moves within `randomMoveMargin`. */
  randomMoveChance: number;
  randomMoveMargin: number;
  /**
   * During the first `openingPlies` plies, moves within `openingMargin` of the best are eligible and get a
   * random bonus of up to `openingMargin`, so near-equal moves alternate between games.
   */
  openingPlies: number;
  openingMargin: number;
  /** Play main-line theory from the opening book while the game is still in it. */
  useOpeningBook: boolean;
}

/**
 * easy: sees one move ahead (plus captures and checks) and picks with heavy noise, so it drops material
 * regularly but still grabs free queens and mates in one.
 * medium: three plies with mild noise. hard and expert: full strength, differing only in thinking time.
 */
export const DIFFICULTY_SETTINGS: Readonly<Record<Difficulty, DifficultySettings>> = {
  easy: {
    maxDepth: 1,
    timeLimitMs: 250,
    candidateMargin: 400,
    noise: 300,
    randomMoveChance: 0.15,
    randomMoveMargin: 150,
    openingPlies: 0,
    openingMargin: 0,
    useOpeningBook: false,
  },
  medium: {
    maxDepth: 3,
    timeLimitMs: 500,
    candidateMargin: 50,
    noise: 50,
    randomMoveChance: 0,
    randomMoveMargin: 0,
    openingPlies: 0,
    openingMargin: 0,
    useOpeningBook: true,
  },
  hard: {
    maxDepth: 64,
    timeLimitMs: 1500,
    candidateMargin: 0,
    noise: 0,
    randomMoveChance: 0,
    randomMoveMargin: 0,
    openingPlies: 6,
    openingMargin: 15,
    useOpeningBook: true,
  },
  expert: {
    maxDepth: 64,
    timeLimitMs: 3000,
    candidateMargin: 0,
    noise: 0,
    randomMoveChance: 0,
    randomMoveMargin: 0,
    openingPlies: 6,
    openingMargin: 15,
    useOpeningBook: true,
  },
};

/** Plies played since the start of the game, derived from the FEN move counters. */
export const gamePlyOf = (position: Position): number => (position.fullmoveNumber - 1) * 2 + position.turn;

const inOpening = (settings: DifficultySettings, gamePly: number): boolean => gamePly < settings.openingPlies;

const candidateMarginAt = (settings: DifficultySettings, gamePly: number): number =>
  inOpening(settings, gamePly) ? Math.max(settings.candidateMargin, settings.openingMargin) : settings.candidateMargin;

const noiseAt = (settings: DifficultySettings, gamePly: number): number =>
  inOpening(settings, gamePly) ? Math.max(settings.noise, settings.openingMargin) : settings.noise;

/** Search limits for a level at a given point in the game. */
export const searchLimitsFor = (settings: DifficultySettings, gamePly: number): SearchLimits => ({
  maxDepth: settings.maxDepth,
  timeLimitMs: settings.timeLimitMs,
  candidateMargin: candidateMarginAt(settings, gamePly),
});

const pickUniformly = (moves: readonly ScoredMove[], rng: Rng): Move => moves[Math.floor(rng() * moves.length)].move;

/** Adds a uniform bonus in [0, noise) to each score and plays the highest total, so better moves stay likelier. */
const pickWithNoise = (candidates: readonly ScoredMove[], noise: number, rng: Rng): Move => {
  let chosen = candidates[0].move;
  let chosenKey = -Infinity;
  for (const candidate of candidates) {
    const key = candidate.score + rng() * noise;
    if (key > chosenKey) {
      chosen = candidate.move;
      chosenKey = key;
    }
  }
  return chosen;
};

/**
 * Picks the move to play from the search's candidates (best first) according to the level's randomness.
 * All randomness comes from `rng`, so a seeded generator makes the choice reproducible.
 */
export const chooseMove = (candidates: readonly ScoredMove[], settings: DifficultySettings, gamePly: number, rng: Rng): Move => {
  const bestScore = candidates[0].score;
  if (settings.randomMoveChance > 0 && rng() < settings.randomMoveChance) {
    return pickUniformly(candidates.filter((candidate) => candidate.score >= bestScore - settings.randomMoveMargin), rng);
  }
  const margin = candidateMarginAt(settings, gamePly);
  const eligible = candidates.filter((candidate) => candidate.score >= bestScore - margin);
  return pickWithNoise(eligible, noiseAt(settings, gamePly), rng);
};

/** Searches `position` at the given level and returns the move that level decides to play. */
export const chooseEngineMove = (position: Position, settings: DifficultySettings, searcher: Searcher, rng: Rng): Move => {
  const gamePly = gamePlyOf(position);
  const result = searcher.search(position, searchLimitsFor(settings, gamePly));
  return chooseMove(result.candidates, settings, gamePly, rng);
};
