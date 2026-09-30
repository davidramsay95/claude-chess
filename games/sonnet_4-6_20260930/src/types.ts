export type PlayerColor = "white" | "black";
export type Difficulty = "easy" | "medium" | "hard" | "expert";
export type GameResult = "1-0" | "0-1" | "1/2-1/2" | "*";
export type DrawReason = "repetition" | "fifty-move" | "insufficient";

export type AppScreen = "setup" | "game";

// The canonical save/load format (matches game_state.json spec)
export interface SavedGame {
  version: 1;
  startFen: string;
  playerColor: PlayerColor;
  difficulty: Difficulty;
  moves: string[];
  resigned: boolean;
}

// Internal game state
export interface GameState {
  playerColor: PlayerColor;
  difficulty: Difficulty;
  startFen: string;
  moves: string[];           // UCI strings of all moves played
  fenHistory: string[];      // FEN after each move (for repetition detection)
  resigned: boolean;
  result: GameResult;
  drawReason?: DrawReason;
  promotionPending?: {
    from: number;
    to: number;
  };
}
