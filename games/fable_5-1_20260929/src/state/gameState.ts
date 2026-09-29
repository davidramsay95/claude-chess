import { Game } from "../engine/game";
import { parseUci } from "../engine/move";
import { Position } from "../engine/position";
import { isDifficulty } from "../engine/protocol";
import type { GameSummary, ImportResult, LiveGame, SavedGameState } from "./contracts";

export const exportGameState = (live: LiveGame): SavedGameState => ({
  version: 1,
  startFen: live.game.startFen,
  playerColor: live.playerColor,
  difficulty: live.difficulty,
  moves: live.game.uciHistory(),
  resigned: live.game.hasResigned(),
});

export const serializeGameState = (state: SavedGameState): string => JSON.stringify(exportOrder(state), null, 2);

/** Rebuild the object so the JSON keys always come out in the documented order. */
const exportOrder = (state: SavedGameState): SavedGameState => ({
  version: state.version,
  startFen: state.startFen,
  playerColor: state.playerColor,
  difficulty: state.difficulty,
  moves: [...state.moves],
  resigned: state.resigned,
});

export const summaryOf = (game: Game): GameSummary => ({
  result: game.result(),
  moveCount: game.plyCount(),
});

const fail = (error: string): ImportResult => ({ ok: false, error });

/**
 * Validate a saved state and replay it through the rules. Nothing observable
 * is produced until every check has passed, so a failed import cannot affect
 * the caller's current game.
 */
export const importGameState = (input: unknown): ImportResult => {
  let data: unknown = input;
  if (typeof input === "string") {
    try {
      data = JSON.parse(input);
    } catch {
      return fail("Not valid JSON");
    }
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return fail("Saved game must be a JSON object");
  }
  const record = data as Record<string, unknown>;

  if (record.version !== 1) return fail("Unsupported version: expected 1");

  const { startFen, playerColor, difficulty, moves, resigned } = record;
  if (typeof startFen !== "string") return fail("startFen must be a string");
  if (playerColor !== "white" && playerColor !== "black") return fail('playerColor must be "white" or "black"');
  if (!isDifficulty(difficulty)) return fail("difficulty must be easy, medium, hard or expert");
  if (!Array.isArray(moves)) return fail("moves must be an array");
  if (typeof resigned !== "boolean") return fail("resigned must be true or false");

  try {
    Position.fromFen(startFen);
  } catch (error) {
    return fail(`startFen is not a valid position: ${error instanceof Error ? error.message : String(error)}`);
  }

  const game = Game.fromFen(startFen);
  for (let i = 0; i < moves.length; i++) {
    const uci = moves[i];
    const label = `Move ${i + 1} (${typeof uci === "string" ? uci : String(uci)})`;
    if (typeof uci !== "string" || parseUci(uci) === null) return fail(`${label} is not a valid move`);
    if (game.isOver()) return fail(`${label} comes after the game ended`);
    if (!game.playUci(uci)) return fail(`${label} is not legal`);
  }
  if (resigned) game.resign(playerColor);

  return { ok: true, value: { game, playerColor, difficulty } };
};
