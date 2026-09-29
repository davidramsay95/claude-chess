import type { Level } from './engineTypes';
import { generateLegalMoves } from './movegen';
import { pickBookMove } from './openingBook';
import type { Position } from './position';
import { type SearchOptions, type SearchResult, searchBestMove } from './search';
import { moveToUci } from './types';

export interface LevelProfile {
  maxDepth: number;
  timeMs: number;
  noiseCp: number;
  blunderChance: number;
  blunderMarginCp: number;
  blunderTopN: number;
  varietyCp: number;
  fullRootScan: boolean;
  /** Opening book is consulted while fewer than this many plies have been played (0 disables it). */
  bookPlies: number;
}

/**
 * Strength ladder. Weak levels search shallowly and pick imperfectly; strong levels search
 * deeper with no deliberate mistakes.
 */
export const LEVEL_PROFILES: Readonly<Record<Level, LevelProfile>> = {
  easy: {
    maxDepth: 2, timeMs: 250, noiseCp: 90, blunderChance: 0.3, blunderMarginCp: 350,
    blunderTopN: 4, varietyCp: 0, fullRootScan: true, bookPlies: 0,
  },
  medium: {
    maxDepth: 3, timeMs: 600, noiseCp: 25, blunderChance: 0.08, blunderMarginCp: 80,
    blunderTopN: 3, varietyCp: 0, fullRootScan: true, bookPlies: 0,
  },
  hard: {
    maxDepth: 6, timeMs: 1500, noiseCp: 0, blunderChance: 0, blunderMarginCp: 0,
    blunderTopN: 1, varietyCp: 8, fullRootScan: false, bookPlies: 6,
  },
  expert: {
    maxDepth: 14, timeMs: 3500, noiseCp: 0, blunderChance: 0, blunderMarginCp: 0,
    blunderTopN: 1, varietyCp: 3, fullRootScan: false, bookPlies: 40,
  },
};

export interface ChooseMoveOptions extends SearchOptions {
  /**
   * Moves played from the standard start position in coordinate notation, used for the book.
   * Pass null when the game did not start from the standard position.
   * Defaults to null (no book), since a book move only makes sense for a known history.
   */
  uciHistory?: readonly string[] | null;
}

/** Plays a level: consults the opening book when allowed, otherwise searches with the level's profile. */
export const chooseMove = (position: Position, level: Level, options: ChooseMoveOptions = {}): SearchResult => {
  const profile = LEVEL_PROFILES[level];
  const rng = options.rng ?? Math.random;
  const history = options.uciHistory ?? null;

  if (history !== null && profile.bookPlies > 0) {
    const bookUci = pickBookMove(history, profile.bookPlies, rng);
    if (bookUci !== undefined) {
      const move = generateLegalMoves(position).find((candidate) => moveToUci(candidate) === bookUci);
      if (move !== undefined) return { move, scoreCp: 0, depth: 0, nodes: 0, elapsedMs: 0 };
    }
  }

  return searchBestMove(position, {
    maxDepth: profile.maxDepth,
    timeMs: profile.timeMs,
    noiseCp: profile.noiseCp,
    blunderChance: profile.blunderChance,
    blunderMarginCp: profile.blunderMarginCp,
    blunderTopN: profile.blunderTopN,
    varietyCp: profile.varietyCp,
    fullRootScan: profile.fullRootScan,
    ...options,
    rng,
  });
};
