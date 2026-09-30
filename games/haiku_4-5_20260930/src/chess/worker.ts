import { Board } from './board';
import { ChessAI } from './ai';

let board: Board | null = null;
let ai: ChessAI | null = null;

self.onmessage = (event: MessageEvent) => {
  const { type, fen, difficulty } = event.data;

  if (type === 'init') {
    board = new Board(fen);
    ai = new ChessAI(board, difficulty);
  } else if (type === 'findMove') {
    if (!board || !ai) {
      self.postMessage({ error: 'AI not initialized' });
      return;
    }

    try {
      const move = ai.findBestMove();
      if (move) {
        const uci = board.moveToUci(move);
        self.postMessage({ move, uci });
      } else {
        self.postMessage({ move: null });
      }
    } catch (error) {
      self.postMessage({ error: String(error) });
    }
  }
};
