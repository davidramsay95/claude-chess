import type { ColorName, Game, GameResult } from "../engine/game";
import type { Difficulty } from "../engine/protocol";

/** The portable saved game, identical to game_state.json at the repository root. */
export interface SavedGameState {
  version: 1;
  startFen: string;
  playerColor: ColorName;
  difficulty: Difficulty;
  moves: string[];
  resigned: boolean;
}

export interface GameSummary {
  result: GameResult;
  moveCount: number;
}

/** A game in progress together with the settings it was started with. */
export interface LiveGame {
  game: Game;
  playerColor: ColorName;
  difficulty: Difficulty;
}

export type ImportResult = { ok: true; value: LiveGame } | { ok: false; error: string };
