/**
 * Game state, export and import. Both the in-page UI and the save bridge go
 * through importState so every load is validated by full replay.
 */
import { Board, START_FEN } from "./engine/board";

export type PlayerColor = "white" | "black";
export type Difficulty = "easy" | "medium" | "hard" | "expert";

export interface SavedGame {
  version: 1;
  startFen: string;
  playerColor: PlayerColor;
  difficulty: Difficulty;
  moves: string[];
  resigned: boolean;
}

export interface GameSummary {
  result: "1-0" | "0-1" | "1/2-1/2" | "*";
  moveCount: number;
}

export interface Game {
  board: Board;
  startFen: string;
  playerColor: PlayerColor;
  difficulty: Difficulty;
  moves: string[];
  sans: string[];
  resigned: boolean;
}

const PLAYER_COLORS: readonly string[] = ["white", "black"];
const DIFFICULTIES: readonly string[] = ["easy", "medium", "hard", "expert"];

export const createGame = (
  playerColor: PlayerColor,
  difficulty: Difficulty,
  startFen?: string
): Game => {
  const fen = startFen ?? START_FEN;
  return {
    board: Board.fromFen(fen),
    startFen: fen,
    playerColor,
    difficulty,
    moves: [],
    sans: [],
    resigned: false
  };
};

/** Plays a UCI move if legal. Returns the SAN of the move played. */
export const applyUci = (game: Game, uci: string): string => {
  const move = game.board.uciToMove(uci);
  if (move === null) {
    throw new Error(`Move ${game.moves.length + 1} (${uci}) is not legal`);
  }
  const san = game.board.san(move);
  game.board.makeMove(move);
  game.moves.push(uci);
  game.sans.push(san);
  return san;
};

export const exportState = (game: Game): SavedGame => ({
  version: 1,
  startFen: game.startFen,
  playerColor: game.playerColor,
  difficulty: game.difficulty,
  moves: [...game.moves],
  resigned: game.resigned
});

export const gameSummary = (game: Game): GameSummary => {
  const status = game.board.status();
  let result: GameSummary["result"] = "*";
  if (game.resigned) {
    result = game.playerColor === "white" ? "0-1" : "1-0";
  } else if (status === "checkmate") {
    result = game.board.turn() === "w" ? "0-1" : "1-0";
  } else if (status !== "playing") {
    result = "1/2-1/2";
  }
  return { result, moveCount: game.moves.length };
};

/**
 * Validates an arbitrary value as a saved game and replays every move through
 * the engine's own rules. Throws with a human-readable message on any
 * problem; the caller's current game is untouched because a whole new Game is
 * built here.
 */
export const importState = (value: unknown): Game => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Saved game must be a JSON object");
  }
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) {
    throw new Error("Unsupported save version (expected 1)");
  }
  if (typeof raw.startFen !== "string") {
    throw new Error("startFen must be a string");
  }
  if (typeof raw.playerColor !== "string" || !PLAYER_COLORS.includes(raw.playerColor)) {
    throw new Error('playerColor must be "white" or "black"');
  }
  if (typeof raw.difficulty !== "string" || !DIFFICULTIES.includes(raw.difficulty)) {
    throw new Error('difficulty must be "easy", "medium", "hard" or "expert"');
  }
  if (!Array.isArray(raw.moves)) {
    throw new Error("moves must be an array");
  }
  if (typeof raw.resigned !== "boolean") {
    throw new Error("resigned must be true or false");
  }

  let startFen: string;
  try {
    startFen = Board.fromFen(raw.startFen).toFen();
  } catch (error) {
    throw new Error(`startFen is not a valid FEN: ${(error as Error).message}`);
  }

  const game = createGame(
    raw.playerColor as PlayerColor,
    raw.difficulty as Difficulty,
    startFen
  );
  for (const [index, uci] of raw.moves.entries()) {
    if (typeof uci !== "string" || !/^[a-h][1-8][a-h][1-8][nbrq]?$/.test(uci)) {
      throw new Error(`Move ${index + 1} is not a UCI string`);
    }
    if (game.board.status() !== "playing") {
      throw new Error(`Move ${index + 1} (${uci}) comes after the game ended`);
    }
    applyUci(game, uci);
  }
  game.resigned = raw.resigned;
  return game;
};
