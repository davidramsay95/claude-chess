import { describe, expect, it } from 'vitest';
import type { Level } from '../src/engine/engineTypes';
import { Game } from '../src/engine/game';
import { chooseMove } from '../src/engine/levels';
import { clearTranspositionTable } from '../src/engine/search';
import { seededRng } from './helpers';

/** Opt-in (STRENGTH=1) because matches are slow and stochastic. */
const enabled = String(import.meta.env.STRENGTH) === '1';
const GAMES_PER_PAIRING = Number(import.meta.env.STRENGTH_GAMES ?? 4);
const MAX_PLIES = 120;
/** Shrinks every level's budget uniformly so the ladder can be measured quickly. */
const TIME_SCALE = Number(import.meta.env.STRENGTH_TIME_SCALE ?? 0.1);

const BUDGET_MS: Record<Level, number> = { easy: 250, medium: 600, hard: 1500, expert: 3500 };

const OPENINGS: readonly (readonly string[])[] = [
  [],
  ['e2e4', 'e7e5'],
  ['d2d4', 'd7d5'],
  ['e2e4', 'c7c5'],
];

/** Returns 1 if white wins, 0 for a draw, -1 if black wins. Adjudicates unfinished games by material. */
const playGame = (white: Level, black: Level, seed: number, opening: readonly string[]): number => {
  const game = new Game();
  for (const uci of opening) game.play(game.parseUci(uci) as number);
  const rng = seededRng(seed);
  clearTranspositionTable();
  while (game.moveHistory.length < MAX_PLIES && game.status().state === 'ongoing') {
    const level = game.turn === 0 ? white : black;
    const result = chooseMove(game.position, level, {
      timeMs: Math.max(5, BUDGET_MS[level] * TIME_SCALE),
      // Keep depth caps as configured; only time is scaled, and the book is off for equal openings.
      uciHistory: null,
      rng,
    });
    if (result.move === undefined) break;
    game.play(result.move);
  }
  const status = game.status();
  if (status.state === 'checkmate') return status.winner === 0 ? 1 : -1;
  if (status.state === 'draw') return 0;
  return adjudicate(game);
};

const PIECE_VALUES = [0, 1, 3, 3, 5, 9, 0];

const adjudicate = (game: Game): number => {
  let balance = 0;
  for (let sq = 0; sq < 64; sq++) {
    const piece = game.position.board[sq];
    if (piece === 0) continue;
    balance += (piece >> 3 ? -1 : 1) * PIECE_VALUES[piece & 7];
  }
  if (balance >= 3) return 1;
  if (balance <= -3) return -1;
  return 0;
};

/** Score of `strong` against `weak` over all games (win = 1, draw = 0.5), colors alternating. */
const playMatch = (strong: Level, weak: Level): number => {
  let score = 0;
  for (let game = 0; game < GAMES_PER_PAIRING; game++) {
    const strongIsWhite = game % 2 === 0;
    const opening = OPENINGS[Math.floor(game / 2) % OPENINGS.length];
    const outcome = strongIsWhite
      ? playGame(strong, weak, 100 + game, opening)
      : playGame(weak, strong, 100 + game, opening);
    const strongResult = strongIsWhite ? outcome : -outcome;
    score += (strongResult + 1) / 2;
  }
  return score;
};

describe.skipIf(!enabled)('strength ladder', () => {
  const pairings: [Level, Level][] = [
    ['expert', 'hard'],
    ['hard', 'medium'],
    ['medium', 'easy'],
    ['expert', 'medium'],
    ['hard', 'easy'],
    ['expert', 'easy'],
  ];

  it('each stronger level outscores every weaker level', { timeout: 30 * 60_000 }, () => {
    const lines: string[] = [];
    let stronger = 0;
    let total = 0;
    for (const [strong, weak] of pairings) {
      const score = playMatch(strong, weak);
      lines.push(`${strong} vs ${weak}: ${score}/${GAMES_PER_PAIRING}`);
      stronger += score;
      total += GAMES_PER_PAIRING;
      expect(score, `${strong} vs ${weak}`).toBeGreaterThan(GAMES_PER_PAIRING / 2);
    }
    console.log(`${lines.join('\n')}\naggregate: ${stronger}/${total}`);
  });
});
