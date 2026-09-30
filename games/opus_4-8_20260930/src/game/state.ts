import { Game, validateStateShape } from "./game.ts";
import { GameState } from "./types.ts";

/** Serialise a game to the portable JSON text used for download/clipboard. */
export function exportStateJson(game: Game): string {
  return JSON.stringify(game.toState(), null, 2);
}

/**
 * Coerce arbitrary input (a JSON string or an already-parsed value) into a
 * validated GameState. Throws a descriptive Error on any problem.
 */
export function parseState(input: unknown): GameState {
  let value = input;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw new Error("State is not valid JSON");
    }
  }
  validateStateShape(value);
  return value;
}

export type LoadOutcome = { ok: true; game: Game } | { ok: false; error: string };

/**
 * Validate and replay a saved state into a fresh Game without disturbing any
 * existing game. Both the in-app import and the message bridge use this, so
 * their acceptance rules are guaranteed identical.
 */
export function tryLoadState(input: unknown): LoadOutcome {
  try {
    const state = parseState(input);
    return { ok: true, game: Game.fromState(state) };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Invalid game state";
    return { ok: false, error };
  }
}
