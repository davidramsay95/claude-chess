/**
 * The portable saved-game format shared by every game on the platform, plus the
 * single validating importer used by both the interface and the save bridge.
 *
 * Importing never mutates anything the caller owns: it builds a brand new
 * {@link Game} and only hands it back once every half-move has replayed
 * legally, so a rejected state leaves the live game exactly as it was.
 */

import { Game, type GameResult, type Side } from "./game.ts";
import { START_FEN, Position } from "./position.ts";
import { isDifficulty, type Difficulty } from "./difficulty.ts";

export const SAVE_VERSION = 1;
/** Guards against a hostile payload turning the importer into a busy loop. */
const MAX_HALF_MOVES = 5000;

export interface SavedGameState {
  version: 1;
  startFen: string;
  playerColor: Side;
  difficulty: Difficulty;
  moves: string[];
  resigned: boolean;
}

export interface GameSummary {
  result: GameResult;
  moveCount: number;
}

export interface LoadedGame {
  game: Game;
  playerColor: Side;
  difficulty: Difficulty;
  state: SavedGameState;
}

export function exportState(
  game: Game,
  playerColor: Side,
  difficulty: Difficulty,
): SavedGameState {
  return {
    version: SAVE_VERSION,
    startFen: game.startFen,
    playerColor,
    difficulty,
    moves: game.uciMoves(),
    resigned: game.resigned,
  };
}

export function summarise(game: Game): GameSummary {
  return { result: game.status().result, moveCount: game.moves.length };
}

export function serializeState(state: SavedGameState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

/** A filename that carries the result and date without colliding between games. */
export function suggestedFilename(state: SavedGameState): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `opus-chess-${stamp}-${state.moves.length}-moves.json`;
}

/**
 * Validates and replays a saved state. Throws an `Error` whose message is short
 * enough to show in the interface or return over the bridge.
 */
export function loadState(input: unknown): LoadedGame {
  const raw = typeof input === "string" ? parseJson(input) : input;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Saved game must be a JSON object");
  }
  const record = raw as Record<string, unknown>;

  if (record.version !== SAVE_VERSION) {
    throw new Error(`Unsupported save version ${String(record.version)}, expected ${SAVE_VERSION}`);
  }

  const startFen = record.startFen === undefined ? START_FEN : record.startFen;
  if (typeof startFen !== "string") throw new Error("startFen must be a FEN string");
  try {
    Position.fromFen(startFen);
  } catch (error) {
    throw new Error(`startFen is not a valid FEN: ${messageOf(error)}`);
  }

  if (record.playerColor !== "white" && record.playerColor !== "black") {
    throw new Error('playerColor must be "white" or "black"');
  }
  if (!isDifficulty(record.difficulty)) {
    throw new Error("difficulty must be easy, medium, hard or expert");
  }
  if (!Array.isArray(record.moves)) {
    throw new Error("moves must be an array of UCI strings");
  }
  if (record.moves.length > MAX_HALF_MOVES) {
    throw new Error(`moves has more than ${MAX_HALF_MOVES} half-moves`);
  }
  if (typeof record.resigned !== "boolean") {
    throw new Error("resigned must be true or false");
  }

  const game = new Game(startFen);
  const moves: string[] = [];
  record.moves.forEach((uci, index) => {
    if (typeof uci !== "string") {
      throw new Error(`Move ${index + 1} is not a UCI string`);
    }
    if (game.status().over) {
      throw new Error(`Move ${index + 1} (${uci}) comes after the game has ended`);
    }
    if (game.findMoveByUci(uci) === null) {
      throw new Error(`Move ${index + 1} (${uci}) is not legal`);
    }
    game.playUci(uci);
    moves.push(uci);
  });

  const playerColor: Side = record.playerColor;
  if (record.resigned) game.resign(playerColor);

  return {
    game,
    playerColor,
    difficulty: record.difficulty,
    state: {
      version: SAVE_VERSION,
      startFen,
      playerColor,
      difficulty: record.difficulty,
      moves,
      resigned: record.resigned,
    },
  };
}

/** Validation only, for callers that just want the normalised state back. */
export function parseState(input: unknown): SavedGameState {
  return loadState(input).state;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Saved game is not valid JSON");
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
