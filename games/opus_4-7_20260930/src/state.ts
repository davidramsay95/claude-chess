import { Game } from "./engine/game.js";
import { START_FEN } from "./engine/fen.js";
import type { Difficulty } from "./engine/search.js";

export interface SavedState {
  version: 1;
  startFen: string;
  playerColor: "white" | "black";
  difficulty: Difficulty;
  moves: string[];
  resigned: boolean;
}

export function exportState(g: Game, playerColor: "white" | "black", difficulty: Difficulty): SavedState {
  return {
    version: 1,
    startFen: g.startFen,
    playerColor,
    difficulty,
    moves: g.uciHistory.slice(),
    resigned: g.resigned !== null,
  };
}

// Validate then replay the moves through the engine, returning a fresh Game.
// Throws on any failure (invalid shape, illegal move, mismatched resigned flag).
export function importState(state: unknown): { game: Game; playerColor: "white" | "black"; difficulty: Difficulty } {
  if (!state || typeof state !== "object") throw new Error("State must be an object");
  const s = state as Partial<SavedState>;
  if (s.version !== 1) throw new Error(`Unsupported version: ${s.version}`);
  if (typeof s.startFen !== "string") throw new Error("startFen must be a string");
  if (s.playerColor !== "white" && s.playerColor !== "black") throw new Error("playerColor must be 'white' or 'black'");
  const validDiffs: Difficulty[] = ["easy", "medium", "hard", "expert"];
  if (!validDiffs.includes(s.difficulty as Difficulty)) throw new Error("difficulty must be easy|medium|hard|expert");
  if (!Array.isArray(s.moves)) throw new Error("moves must be an array");
  if (typeof s.resigned !== "boolean") throw new Error("resigned must be boolean");

  const g = new Game(s.startFen);
  for (let i = 0; i < s.moves.length; i++) {
    const uci = s.moves[i];
    if (typeof uci !== "string") throw new Error(`Move ${i + 1} is not a string`);
    const detail = g.makeUci(uci);
    if (!detail) throw new Error(`Move ${i + 1} (${uci}) is not legal`);
  }
  if (s.resigned) {
    // The mover at that point resigned.
    g.resign(g.position.turn);
  }
  return { game: g, playerColor: s.playerColor, difficulty: s.difficulty as Difficulty };
}

export function emptyStartState(playerColor: "white" | "black", difficulty: Difficulty): SavedState {
  return {
    version: 1,
    startFen: START_FEN,
    playerColor,
    difficulty,
    moves: [],
    resigned: false,
  };
}
