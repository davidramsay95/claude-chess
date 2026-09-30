import { GameResult, Move } from "../engine/types.ts";

export type PlayerColor = "white" | "black";
export type Difficulty = "easy" | "medium" | "hard" | "expert";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "expert"];

/** The portable saved-game shape shared across every model's game. */
export interface GameState {
  version: 1;
  startFen: string;
  playerColor: PlayerColor;
  difficulty: Difficulty;
  moves: string[];
  resigned: boolean;
}

export interface MoveRecord {
  move: Move;
  uci: string;
  san: string;
  fenAfter: string;
}

export type EndReason =
  | "checkmate"
  | "stalemate"
  | "fifty-move"
  | "threefold"
  | "insufficient"
  | "resignation"
  | null;

export interface GameStatus {
  result: GameResult;
  reason: EndReason;
  inCheck: boolean;
  isOver: boolean;
}
