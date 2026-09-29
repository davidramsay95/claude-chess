import { Game, type GameResult } from "../core/game";
import { BLACK, WHITE, type Color } from "../core/position";
import { DIFFICULTIES, isDifficulty, type Difficulty } from "../engine/difficulty";

/** Which side the human plays. */
export type PlayerColor = "white" | "black";

/** Version 1 of the saved game format (see game_state.json and docs/save-bridge-protocol.md). */
export interface GameStateV1 {
  version: 1;
  startFen: string;
  playerColor: PlayerColor;
  difficulty: Difficulty;
  moves: string[];
  resigned: boolean;
}

/** Result and length of a game, as the save bridge reports it to the shell. */
export interface GameSummary {
  result: GameResult;
  moveCount: number;
}

/** A validated state together with the game rebuilt by replaying it. */
export interface LoadedGame {
  state: GameStateV1;
  game: Game;
}

/** Outcome of validating a saved game; `error` is short and readable enough to show a user. */
export type ParseOutcome = { ok: true; loaded: LoadedGame } | { ok: false; error: string };

/**
 * Longest move list accepted. Real games stay far below this; the cap stops a hostile or
 * corrupted save from making the replay (quadratic in the repetition check) freeze the tab.
 */
export const MAX_MOVES = 5000;

const UCI_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPlayerColor = (value: unknown): value is PlayerColor => value === "white" || value === "black";

/** Maps the save format's colour name to the core engine colour. */
export const toCoreColor = (color: PlayerColor): Color => (color === "white" ? WHITE : BLACK);

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const fail = (error: string): ParseOutcome => ({ ok: false, error });

const validateMoves = (moves: unknown): string[] | string => {
  if (!Array.isArray(moves)) return "moves must be an array";
  if (moves.length > MAX_MOVES) return `moves has more than ${MAX_MOVES} entries`;
  const valid: string[] = [];
  for (const [index, move] of moves.entries()) {
    if (typeof move !== "string" || !UCI_PATTERN.test(move)) return `Move ${index + 1} is not a valid UCI move`;
    valid.push(move);
  }
  return valid;
};

/** Replays `moves` onto `game`; returns an error message or null on success. */
const replay = (game: Game, moves: readonly string[]): string | null => {
  for (const [index, uci] of moves.entries()) {
    if (game.status().result !== "*") return `Move ${index + 1} (${uci}) comes after the game ended`;
    try {
      game.play(uci);
    } catch {
      // Game.play only throws for an illegal move here, because the finished case is checked above.
      return `Move ${index + 1} (${uci}) is not legal`;
    }
  }
  return null;
};

/**
 * Validates an untrusted saved game and rebuilds it by replaying every move.
 * Unknown extra fields are ignored. The returned state holds the normalised FEN.
 */
export const parseGameState = (input: unknown): ParseOutcome => {
  if (!isRecord(input)) return fail("Saved game must be a JSON object");
  if (input.version !== 1) return fail("Unsupported save version (expected 1)");
  const { startFen, playerColor, difficulty, resigned } = input;
  if (typeof startFen !== "string") return fail("startFen must be a string");
  if (!isPlayerColor(playerColor)) return fail('playerColor must be "white" or "black"');
  if (!isDifficulty(difficulty)) return fail(`difficulty must be one of ${DIFFICULTIES.join(", ")}`);
  const moves = validateMoves(input.moves);
  if (typeof moves === "string") return fail(moves);
  if (typeof resigned !== "boolean") return fail("resigned must be a boolean");

  let game: Game;
  try {
    game = new Game(startFen);
  } catch (error) {
    return fail(`startFen is invalid: ${errorMessage(error)}`);
  }
  const replayError = replay(game, moves);
  if (replayError !== null) return fail(replayError);
  if (resigned) {
    if (game.status().result !== "*") return fail("resigned is true but the game had already ended");
    game.resign(toCoreColor(playerColor));
  }

  return {
    ok: true,
    loaded: { state: { version: 1, startFen: game.startFen, playerColor, difficulty, moves, resigned }, game },
  };
};

/** Parses JSON text (for example an imported file) and validates it with {@link parseGameState}. */
export const parseGameStateText = (text: string): ParseOutcome => {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    // The parser's own message is engine-specific and unhelpful to a player.
    return fail("Saved game is not valid JSON");
  }
  return parseGameState(input);
};

/** Captures a game as a saved state. `resigned` is true only when the human's colour resigned. */
export const buildGameState = (game: Game, playerColor: PlayerColor, difficulty: Difficulty): GameStateV1 => ({
  version: 1,
  startFen: game.startFen,
  playerColor,
  difficulty,
  moves: game.moves.map((move) => move.uci),
  resigned: game.resignedColor === toCoreColor(playerColor),
});

/** Pretty-printed JSON (two-space indent) for files a person may open. */
export const serializeGameState = (state: GameStateV1): string => JSON.stringify(state, null, 2);

/** Result and half-move count of `game`. */
export const summarize = (game: Game): GameSummary => ({
  result: game.status().result,
  moveCount: game.moves.length,
});
