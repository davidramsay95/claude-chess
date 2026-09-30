import { Board } from '../chess/board';
import { Move, Color } from '../chess/types';

export interface GameStateExport {
  version: 1;
  startFen: string;
  playerColor: 'white' | 'black';
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  moves: string[];
  resigned: boolean;
}

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export class GameManager {
  private board: Board;
  private startFen: string = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  private playerColor: Color = 'white';
  private difficulty: Difficulty = 'medium';
  private gameStarted: boolean = false;
  private gameEnded: boolean = false;
  private endReason: string | null = null;
  private resigned: boolean = false;

  constructor() {
    this.board = new Board(this.startFen);
  }

  startNewGame(playerColor: Color, difficulty: Difficulty): void {
    this.playerColor = playerColor;
    this.difficulty = difficulty;
    this.board = new Board(this.startFen);
    this.gameStarted = true;
    this.gameEnded = false;
    this.endReason = null;
    this.resigned = false;
  }

  makePlayerMove(move: Move): boolean {
    if (this.gameEnded) return false;
    if (this.board.getState().turn !== this.playerColor) return false;

    const success = this.board.makeMove(move);
    if (success) {
      this.updateGameStatus();
    }
    return success;
  }

  getBoard(): Board {
    return this.board;
  }

  getPlayerColor(): Color {
    return this.playerColor;
  }

  getDifficulty(): Difficulty {
    return this.difficulty;
  }

  isPlayerTurn(): boolean {
    return this.board.getState().turn === this.playerColor;
  }

  isGameEnded(): boolean {
    return this.gameEnded;
  }

  getEndReason(): string | null {
    return this.endReason;
  }

  getGameStatus(): { isCheck: boolean; isCheckmate: boolean; isStalemate: boolean; isDraw: boolean } {
    const state = this.board.getState();
    const isCheck = this.board.isInCheck(state.turn);
    const isCheckmate = this.board.isCheckmate();
    const isStalemate = this.board.isStalemate();
    const isDraw = this.board.isThreefoldRepetition() || this.board.isFiftymoveRule() || this.board.isInsufficientMaterial();

    return { isCheck, isCheckmate, isStalemate, isDraw };
  }

  private updateGameStatus(): void {
    const { isCheckmate, isStalemate, isDraw } = this.getGameStatus();

    if (isCheckmate) {
      this.gameEnded = true;
      this.endReason = this.board.getState().turn === 'white' ? 'Checkmate - Black wins' : 'Checkmate - White wins';
    } else if (isStalemate) {
      this.gameEnded = true;
      this.endReason = 'Stalemate - Draw';
    } else if (isDraw) {
      this.gameEnded = true;
      this.endReason = 'Draw by repetition or fifty-move rule';
    }
  }

  resign(): void {
    this.gameEnded = true;
    this.resigned = true;
    this.endReason = this.playerColor === 'white' ? 'White resigned - Black wins' : 'Black resigned - White wins';
  }

  exportGameState(): GameStateExport {
    return {
      version: 1,
      startFen: this.startFen,
      playerColor: this.playerColor,
      difficulty: this.difficulty,
      moves: this.board.getMoveHistory(),
      resigned: this.resigned,
    };
  }

  importGameState(state: GameStateExport): boolean {
    if (state.version !== 1) return false;

    try {
      const newBoard = new Board(state.startFen);
      for (const uci of state.moves) {
        const move = newBoard.uciToMove(uci);
        if (!move || !newBoard.makeMove(move)) {
          return false;
        }
      }

      this.board = newBoard;
      this.startFen = state.startFen;
      this.playerColor = state.playerColor;
      this.difficulty = state.difficulty;
      this.resigned = state.resigned;
      this.gameStarted = true;
      this.updateGameStatus();

      return true;
    } catch {
      return false;
    }
  }

  getMoveHistory(): string[] {
    return this.board.getMoveHistory();
  }

  getPreviousPosition(): boolean {
    const history = this.board.getMoveHistory();
    if (history.length === 0) return false;

    const newBoard = new Board(this.startFen);
    const movesToReplay = history.slice(0, -1);

    for (const uci of movesToReplay) {
      const move = newBoard.uciToMove(uci);
      if (!move || !newBoard.makeMove(move)) {
        return false;
      }
    }

    this.board = newBoard;
    return true;
  }

  getLegalMoves(): Move[] {
    if (this.gameEnded) return [];
    if (this.board.getState().turn !== this.playerColor) return [];
    return this.board.getLegalMoves();
  }
}
