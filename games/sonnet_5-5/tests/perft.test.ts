import { describe, expect, it } from 'vitest';
import { Position } from '../src/engine/position';
import { generateLegalMoves } from '../src/engine/movegen';

function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  const moves = generateLegalMoves(pos);
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (const move of moves) {
    pos.makeMove(move);
    nodes += perft(pos, depth - 1);
    pos.unmakeMove();
  }
  return nodes;
}

const cases: Array<[string, string, number, number]> = [
  ['startpos d1', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 1, 20],
  ['startpos d4', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 4, 197281],
  ['kiwipete d3', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 3, 97862],
  ['position 3 d5', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 5, 674624],
  ['position 4 d3', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', 3, 9467],
  ['position 4 mirrored d3', 'r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1', 3, 9467],
  ['position 5 d3', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', 3, 62379],
  ['position 6 d3', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', 3, 89890],
];

describe('perft', () => {
  it.each(cases)('%s', (_name, fen, depth, expected) => {
    expect(perft(Position.fromFen(fen), depth)).toBe(expected);
  });
});

describe('fen', () => {
  it('round-trips', () => {
    const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
    expect(Position.fromFen(fen).toFen()).toBe(fen);
  });
  it('makes and unmakes to identical state and hash', () => {
    const pos = Position.fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    const fen = pos.toFen();
    const hash = pos.hashLo;
    for (const m of generateLegalMoves(pos)) {
      pos.makeMove(m);
      pos.unmakeMove();
      expect(pos.toFen()).toBe(fen);
      expect(pos.hashLo).toBe(hash);
    }
  });
  it('incremental hash equals recomputed hash after moves', () => {
    const pos = Position.fromFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
    for (const m of generateLegalMoves(pos)) {
      pos.makeMove(m);
      const fresh = Position.fromFen(pos.toFen());
      expect(pos.hashLo).toBe(fresh.hashLo);
      expect(pos.hashHi).toBe(fresh.hashHi);
      pos.unmakeMove();
    }
  });
});
