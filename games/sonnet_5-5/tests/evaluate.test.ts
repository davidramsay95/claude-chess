import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/engine/evaluate';
import { Position } from '../src/engine/position';
import { mirrorFen } from './helpers';

const FENS = [
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
  'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
  '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
  '4k3/8/8/8/8/8/PPP5/4K3 b - - 0 1',
  '6k1/5ppp/8/8/8/8/5PP1/R5K1 w - - 3 30',
  'rnbq1rk1/pp2ppbp/3p1np1/2p5/2PPP3/2N2N2/PP2BPPP/R1BQK2R b KQ - 1 7',
  'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',
];

describe('evaluate', () => {
  it('is symmetric under color mirroring', () => {
    for (const fen of FENS) {
      const original = evaluate(Position.fromFen(fen));
      const mirrored = evaluate(Position.fromFen(mirrorFen(fen)));
      expect(mirrored, fen).toBe(original);
    }
  });

  it('prefers the side that is up a queen', () => {
    const white = evaluate(Position.fromFen('4k3/8/8/8/8/8/8/3QK3 w - - 0 1'));
    const black = evaluate(Position.fromFen('4k3/8/8/8/8/8/8/3QK3 b - - 0 1'));
    expect(white).toBeGreaterThan(800);
    expect(black).toBeLessThan(-800);
  });

  it('rewards a passed pawn over a blocked one', () => {
    const passed = evaluate(Position.fromFen('4k3/8/8/4P3/8/8/8/4K3 w - - 0 1'));
    const blocked = evaluate(Position.fromFen('4k3/4p3/8/4P3/8/8/8/4K3 w - - 0 1'));
    expect(passed).toBeGreaterThan(blocked);
  });

  it('penalizes doubled and isolated pawns', () => {
    const healthy = evaluate(Position.fromFen('4k3/8/8/8/8/8/PP6/4K3 w - - 0 1'));
    const doubled = evaluate(Position.fromFen('4k3/8/8/8/8/P7/P7/4K3 w - - 0 1'));
    expect(healthy).toBeGreaterThan(doubled);
  });

  it('scores dead-drawn material as zero', () => {
    expect(evaluate(Position.fromFen('4k3/8/8/8/8/8/8/4KB2 w - - 0 1'))).toBe(0);
  });
});
