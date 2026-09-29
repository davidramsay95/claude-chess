import { Game, type GameResult } from "./engine/game";

export type Difficulty = "easy" | "medium" | "hard" | "expert";
export type PlayerColor = "white" | "black";

export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard", "expert"];

/** The portable game state shared by every game on the platform. */
export interface GameState {
  version: 1;
  startFen: string;
  playerColor: PlayerColor;
  difficulty: Difficulty;
  moves: string[];
  resigned: boolean;
}

export interface GameSummary {
  result: GameResult;
  moveCount: number;
}

export type ParsedState = { ok: true; state: GameState; game: Game } | { ok: false; error: string };

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Replays every move through the real rules. Nothing outside the returned
 * Game is touched, so a failure cannot corrupt a game in progress.
 */
export const replayMoves = (startFen: string, moves: readonly string[]): { ok: true; game: Game } | { ok: false; error: string } => {
  let game: Game;
  try {
    game = new Game(startFen);
  } catch (error) {
    return { ok: false, error: `Invalid start position: ${error instanceof Error ? error.message : "unreadable FEN"}` };
  }
  for (let index = 0; index < moves.length; index++) {
    if (game.status().result !== "*") return { ok: false, error: `Move ${index + 1} was played after the game ended` };
    if (!game.playUci(moves[index])) return { ok: false, error: `Move ${index + 1} (${moves[index]}) is not legal` };
  }
  return { ok: true, game };
};

/** Validates an untrusted value as a full game state and replays it. */
export const validateState = (raw: unknown): ParsedState => {
  if (!isRecord(raw)) return { ok: false, error: "State must be a JSON object" };
  if (raw.version !== 1) return { ok: false, error: "Unsupported state version" };
  if (typeof raw.startFen !== "string") return { ok: false, error: "startFen must be a string" };
  if (raw.playerColor !== "white" && raw.playerColor !== "black") {
    return { ok: false, error: "playerColor must be white or black" };
  }
  if (typeof raw.difficulty !== "string" || !DIFFICULTIES.includes(raw.difficulty as Difficulty)) {
    return { ok: false, error: "difficulty must be easy, medium, hard or expert" };
  }
  if (!Array.isArray(raw.moves) || !raw.moves.every((move): move is string => typeof move === "string")) {
    return { ok: false, error: "moves must be an array of UCI strings" };
  }
  if (typeof raw.resigned !== "boolean") return { ok: false, error: "resigned must be true or false" };

  const replay = replayMoves(raw.startFen, raw.moves);
  if (!replay.ok) return replay;
  const state: GameState = {
    version: 1,
    startFen: raw.startFen,
    playerColor: raw.playerColor,
    difficulty: raw.difficulty as Difficulty,
    moves: [...raw.moves],
    resigned: raw.resigned,
  };
  return { ok: true, state, game: replay.game };
};

/** Parses pasted or uploaded JSON text, then validates it. */
export const parseStateText = (text: string): ParsedState => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That is not valid JSON" };
  }
  return validateState(raw);
};

export const summarize = (state: GameState, game: Game): GameSummary => {
  const moveCount = state.moves.length;
  if (state.resigned) return { result: state.playerColor === "white" ? "0-1" : "1-0", moveCount };
  return { result: game.status().result, moveCount };
};
