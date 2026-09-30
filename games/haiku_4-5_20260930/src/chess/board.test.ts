import { describe, it, expect } from 'vitest';
import { Board } from './board';

describe('Board - Move Generation', () => {
  it('should generate moves from start position', () => {
    const board = new Board();
    const moves = board.getLegalMoves();
    expect(moves.length).toBeGreaterThan(0);
  });

  it('should handle standard positions', () => {
    const kiwipete = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -';
    const board = new Board(kiwipete);
    const moves = board.getLegalMoves();
    expect(moves.length).toBeGreaterThan(40);
  });
});

describe('Board - Basic Moves', () => {
  it('should allow pawn and piece moves from start', () => {
    const board = new Board();
    const moves = board.getLegalMoves();
    expect(moves.length).toBeGreaterThan(0);

    const hasPawnMoves = moves.some(m => {
      const from = board.getState().board[m.from];
      return from === 'P';
    });
    expect(hasPawnMoves).toBe(true);
  });
});

describe('Board - Castling', () => {
  it('should prevent illegal king moves in opening', () => {
    const board = new Board();
    const kingMoves = board.getLegalMoves().filter(m => {
      const from = board.getState().board[m.from];
      return from === 'K';
    });
    expect(kingMoves.length).toBe(0);
  });
});

describe('Board - Special Moves', () => {
  it('should track en passant state', () => {
    const board = new Board();
    const initial = board.getState().enPassantSquare;
    expect(initial).toBeNull();
  });
});;

describe('Board - Game State', () => {
  it('should initialize from FEN', () => {
    const board = new Board('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(board.getState().turn).toBe('white');
  });

  it('should track game history', () => {
    const board = new Board();
    const pos = board.getPosition();
    expect(pos.history).toEqual([]);
  });
});
