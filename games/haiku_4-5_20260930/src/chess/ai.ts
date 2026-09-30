import { Board } from './board';
import { Move, Color } from './types';

type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

const PIECE_VALUES: { [key: string]: number } = {
  'P': 1, 'p': 1,
  'N': 3, 'n': 3,
  'B': 3, 'b': 3,
  'R': 5, 'r': 5,
  'Q': 9, 'q': 9,
  'K': 0, 'k': 0,
};

const PAWN_BONUS = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0
];

const KNIGHT_BONUS = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50
];

const BISHOP_BONUS = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20
];

const KING_MIDGAME = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20
];

export class ChessAI {
  private board: Board;
  private difficulty: Difficulty;
  private maxDepth: number;

  constructor(board: Board, difficulty: Difficulty = 'medium') {
    this.board = board;
    this.difficulty = difficulty;
    this.maxDepth = this.getDepthForDifficulty(difficulty);
  }

  private getDepthForDifficulty(difficulty: Difficulty): number {
    switch (difficulty) {
      case 'easy': return 2;
      case 'medium': return 4;
      case 'hard': return 6;
      case 'expert': return 7;
    }
  }

  findBestMove(): Move | null {
    const moves = this.board.getLegalMoves();
    if (moves.length === 0) return null;

    let bestMove = moves[0];
    let bestScore = -Infinity;

    for (const move of moves) {
      this.board.makeMove(move);
      const score = this.minimax(this.maxDepth - 1, -Infinity, Infinity, false);
      this.board.loadFromPosition(this.board.getPosition());

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }

  private minimax(depth: number, alpha: number, beta: number, isMaximizing: boolean): number {
    const state = this.board.getState();

    if (depth === 0) {
      return this.evaluate();
    }

    if (this.board.isCheckmate()) {
      return isMaximizing ? -Infinity : Infinity;
    }

    if (this.board.isStalemate()) {
      return 0;
    }

    if (this.board.isThreefoldRepetition() || this.board.isFiftymoveRule()) {
      return 0;
    }

    if (this.board.isInsufficientMaterial()) {
      return 0;
    }

    const moves = this.board.getLegalMoves();

    if (isMaximizing) {
      let value = -Infinity;
      for (const move of moves) {
        this.board.makeMove(move);
        value = Math.max(value, this.minimax(depth - 1, alpha, beta, false));
        this.board.loadFromPosition(this.board.getPosition());
        alpha = Math.max(alpha, value);
        if (beta <= alpha) break;
      }
      return value;
    } else {
      let value = Infinity;
      for (const move of moves) {
        this.board.makeMove(move);
        value = Math.min(value, this.minimax(depth - 1, alpha, beta, true));
        this.board.loadFromPosition(this.board.getPosition());
        beta = Math.min(beta, value);
        if (beta <= alpha) break;
      }
      return value;
    }
  }

  private evaluate(): number {
    const state = this.board.getState();
    let score = 0;

    for (let square = 0; square < 64; square++) {
      const piece = state.board[square];
      if (!piece) continue;

      const isWhite = piece === piece.toUpperCase();
      const value = PIECE_VALUES[piece] || 0;
      let positionalBonus = 0;

      switch (piece.toLowerCase()) {
        case 'p':
          positionalBonus = isWhite ? PAWN_BONUS[square] : PAWN_BONUS[63 - square];
          break;
        case 'n':
          positionalBonus = isWhite ? KNIGHT_BONUS[square] : KNIGHT_BONUS[63 - square];
          break;
        case 'b':
          positionalBonus = isWhite ? BISHOP_BONUS[square] : BISHOP_BONUS[63 - square];
          break;
        case 'k':
          positionalBonus = isWhite ? KING_MIDGAME[square] : KING_MIDGAME[63 - square];
          break;
      }

      const total = value + positionalBonus * 0.1;
      score += isWhite ? total : -total;
    }

    if (this.board.isInCheck(state.turn === 'white' ? 'white' : 'black')) {
      score += state.turn === 'white' ? -50 : 50;
    }

    return score;
  }
}
