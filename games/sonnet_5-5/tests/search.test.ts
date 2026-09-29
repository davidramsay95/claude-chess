import { describe, expect, it } from 'vitest';
import { Game } from '../src/engine/game';
import { Position } from '../src/engine/position';
import { LEVELS, type Level } from '../src/engine/engineTypes';
import { chooseMove, LEVEL_PROFILES } from '../src/engine/levels';
import { MATE_SCORE, searchBestMove } from '../src/engine/search';
import { moveToUci } from '../src/engine/types';
import { playUci, randomLegalMove, seededRng } from './helpers';

const bestUci = (fen: string, level: Level, timeMs = 400): string | undefined => {
  const result = chooseMove(Position.fromFen(fen), level, { timeMs, rng: seededRng(7) });
  return result.move === undefined ? undefined : moveToUci(result.move);
};

describe('tactics', () => {
  it.each(['hard', 'expert'] as const)('finds mate in one at %s', (level) => {
    expect(bestUci('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', level)).toBe('a1a8');
    expect(bestUci('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', level)).toBe('h5f7');
  });

  it.each(['hard', 'expert'] as const)('finds mate in two at %s and follows through', (level) => {
    const fen = '7k/8/8/8/8/8/1R6/R5K1 w - - 0 1';
    const first = chooseMove(Position.fromFen(fen), level, { timeMs: 600, rng: seededRng(3) });
    expect(first.scoreCp).toBe(MATE_SCORE - 3);
    const game = Game.fromFen(fen);
    game.play(first.move as number);
    for (const reply of game.legalMoves()) {
      game.play(reply);
      const mate = chooseMove(game.position, level, { timeMs: 300, rng: seededRng(3) });
      expect(mate.scoreCp).toBe(MATE_SCORE - 1);
      game.undo();
    }
  });

  it.each(['medium', 'hard', 'expert'] as const)('does not grab a poisoned pawn with the queen at %s', (level) => {
    // Qxd5 loses the queen to exd5; every sensible level must decline.
    expect(bestUci('4k3/8/4p3/3p4/8/8/3Q4/4K3 w - - 0 1', level, 200)).not.toBe('d2d5');
  });

  it.each(LEVELS)('takes a free queen at %s', (level) => {
    // Black queen on d5 hangs to the knight on c3 (Nxd5); every level should grab it.
    const fen = '4k3/8/8/3q4/8/2N5/8/4K3 w - - 0 1';
    let taken = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const result = chooseMove(Position.fromFen(fen), level, { timeMs: 200, rng: seededRng(seed) });
      if (result.move !== undefined && moveToUci(result.move) === 'c3d5') taken++;
    }
    expect(taken).toBeGreaterThanOrEqual(level === 'easy' ? 6 : 10);
  });

  it('easy sees a mate in one most of the time', () => {
    let mates = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const result = chooseMove(Position.fromFen('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'), 'easy', {
        rng: seededRng(seed),
      });
      if (result.move !== undefined && moveToUci(result.move) === 'a1a8') mates++;
    }
    expect(mates).toBeGreaterThanOrEqual(12);
  });
});

describe('search edge cases', () => {
  it('returns no move when checkmated or stalemated', () => {
    const mated = searchBestMove(Position.fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), { timeMs: 100 });
    expect(mated.move).toBeUndefined();
    const checkmated = searchBestMove(Position.fromFen('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1'), { timeMs: 100 });
    expect(checkmated.move).toBeUndefined();
    expect(checkmated.scoreCp).toBe(-MATE_SCORE);
  });

  it('answers a forced move immediately', () => {
    const start = performance.now();
    const result = chooseMove(Position.fromFen('k6r/8/8/3b4/8/8/8/7K w - - 0 1'), 'expert');
    expect(moveToUci(result.move as number)).toBe('h1g1');
    expect(performance.now() - start).toBeLessThan(200);
  });

  it('restores the position after searching', () => {
    const position = Position.startPosition();
    const before = position.toFen();
    searchBestMove(position, { timeMs: 150 });
    expect(position.toFen()).toBe(before);
  });

  it('always returns a move even with a zero time budget', () => {
    const result = searchBestMove(Position.startPosition(), { timeMs: 0 });
    expect(result.move).toBeDefined();
    expect(result.depth).toBeGreaterThanOrEqual(1);
  });

  it('respects the time budget', () => {
    for (const timeMs of [100, 300]) {
      const start = performance.now();
      searchBestMove(Position.fromFen('r1bq1rk1/pp2ppbp/2np1np1/8/3NP3/2N1BP2/PPPQ2PP/R3KB1R w KQ - 0 9'), {
        timeMs,
        maxDepth: 30,
      });
      expect(performance.now() - start).toBeLessThan(timeMs * 1.5 + 60);
    }
  });

  it('has monotonically stronger profiles', () => {
    const [easy, medium, hard, expert] = LEVELS.map((level) => LEVEL_PROFILES[level]);
    expect(easy.maxDepth).toBeLessThan(medium.maxDepth);
    expect(medium.maxDepth).toBeLessThan(hard.maxDepth);
    expect(hard.maxDepth).toBeLessThan(expert.maxDepth);
    expect(easy.noiseCp).toBeGreaterThan(medium.noiseCp);
    expect(medium.noiseCp).toBeGreaterThanOrEqual(hard.noiseCp);
    expect(easy.blunderChance).toBeGreaterThan(medium.blunderChance);
    expect(expert.timeMs).toBeGreaterThan(hard.timeMs);
  });
});

describe('legality', () => {
  it.each(LEVELS)('only plays legal moves in random playouts at %s', (level) => {
    const rng = seededRng(level.length * 101);
    for (let gameIndex = 0; gameIndex < 2; gameIndex++) {
      const game = new Game();
      for (let ply = 0; ply < 40; ply++) {
        if (game.status().state !== 'ongoing') break;
        const legal = game.legalMoves();
        const engineTurn = ply % 2 === gameIndex;
        const move = engineTurn
          ? chooseMove(game.position, level, { timeMs: 25, maxDepth: 4, rng, uciHistory: null }).move
          : randomLegalMove(game, rng);
        expect(move).toBeDefined();
        expect(legal).toContain(move);
        game.play(move as number);
      }
    }
  });
});

describe('endgames', () => {
  const playToMate = (fen: string, maxMoves: number, timeMs: number): { mated: boolean; game: Game } => {
    const game = Game.fromFen(fen);
    const rng = seededRng(11);
    for (let i = 0; i < maxMoves * 2; i++) {
      const status = game.status();
      if (status.state !== 'ongoing') break;
      const move =
        game.turn === 0
          ? chooseMove(game.position, 'expert', { timeMs, uciHistory: null, rng }).move
          : randomLegalMove(game, rng);
      game.play(move as number);
    }
    return { mated: game.status().state === 'checkmate', game };
  };

  it('mates with king and queen against a lone king', () => {
    const { mated } = playToMate('8/8/8/3k4/8/8/8/Q3K3 w - - 0 1', 30, 120);
    expect(mated).toBe(true);
  });

  it('mates with king and rook against a lone king', () => {
    const { mated } = playToMate('8/8/8/3k4/8/8/8/R3K3 w - - 0 1', 50, 150);
    expect(mated).toBe(true);
  });

  it('does not drift into a threefold repetition when winning', () => {
    const game = Game.fromFen('4k3/8/8/8/8/8/8/Q3K3 w - - 0 1');
    playUci(game, ['a1a2', 'e8d8', 'a2a1', 'd8e8']);
    for (let i = 0; i < 12; i++) {
      const move = chooseMove(game.position, 'hard', { timeMs: 100, uciHistory: null, rng: seededRng(i) }).move;
      game.play(move as number);
      expect(game.status().reason).not.toBe('threefold-repetition');
      const reply = game.legalMoves()[0];
      if (reply === undefined) break;
      game.play(reply);
    }
  });
});

describe('performance', () => {
  it('searches at a healthy node rate', () => {
    const position = Position.fromFen('r1bq1rk1/pp2ppbp/2np1np1/8/3NP3/2N1BP2/PPPQ2PP/R3KB1R w KQ - 0 9');
    const result = searchBestMove(position, { timeMs: 1000, maxDepth: 30 });
    const nps = result.nodes / Math.max(1, result.elapsedMs / 1000);
    console.log(`nps: ${Math.round(nps)} depth: ${result.depth}`);
    expect(nps).toBeGreaterThan(100_000);
  });
});
