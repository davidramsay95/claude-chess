/**
 * Engine Web Worker. Stateless: each request carries the full game (start FEN
 * plus moves), the worker replays it and answers with the chosen move, so the
 * interface thread never blocks on search.
 */
import { Board } from "./engine/board";
import { chooseMove, type SearchDifficulty } from "./engine/search";

export interface EngineRequest {
  requestId: number;
  startFen: string;
  moves: string[];
  difficulty: SearchDifficulty;
}

export interface EngineReply {
  requestId: number;
  uci: string | null;
  error?: string;
}

self.onmessage = (event: MessageEvent<EngineRequest>) => {
  const { requestId, startFen, moves, difficulty } = event.data;
  try {
    const board = Board.fromFen(startFen);
    for (const uci of moves) {
      const move = board.uciToMove(uci);
      if (move === null) throw new Error(`Illegal move in history: ${uci}`);
      board.makeMove(move);
    }
    const move = chooseMove(board, difficulty);
    const reply: EngineReply = {
      requestId,
      uci: move === null ? null : board.moveToUci(move)
    };
    self.postMessage(reply);
  } catch (error) {
    const reply: EngineReply = {
      requestId,
      uci: null,
      error: error instanceof Error ? error.message : "Engine failure"
    };
    self.postMessage(reply);
  }
};
