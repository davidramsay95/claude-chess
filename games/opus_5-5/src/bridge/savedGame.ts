import { ChessGame, type Side } from "@/chess/game";
import { DIFFICULTIES, type Difficulty } from "@/engine/protocol";

/** Everything needed to rebuild a game: the move list is replayed, so it stays the single source of truth. */
export interface SavedGame {
  humanColor: Side;
  difficulty: Difficulty;
  /** Half-moves in UCI notation, starting from the initial position. */
  moves: readonly string[];
  resigned: boolean;
}

export interface SavedGameSummary {
  result: "1-0" | "0-1" | "1/2-1/2" | "*";
  moveCount: number;
}

const replay = (moves: readonly string[]): ChessGame => {
  const game = new ChessGame();
  for (const uci of moves) game.play(uci);
  return game;
};

/** Derives the PGN-style result and half-move count; a resignation is a win for the engine. */
export const summarizeSavedGame = (saved: SavedGame): SavedGameSummary => {
  const moveCount = saved.moves.length;
  if (saved.resigned) return { result: saved.humanColor === "w" ? "0-1" : "1-0", moveCount };
  const result = replay(saved.moves).result();
  if (result.state === "checkmate") return { result: result.winner === "w" ? "1-0" : "0-1", moveCount };
  return { result: result.state === "draw" ? "1/2-1/2" : "*", moveCount };
};

/** Validates untrusted input and replays it; throws an Error with a short message when it is not a playable game. */
export const parseSavedGame = (value: unknown): SavedGame => {
  if (typeof value !== "object" || value === null) throw new Error("Saved game must be an object");
  // Narrowed to an object above; each field is validated individually below.
  const { humanColor, difficulty, moves, resigned } = value as Record<string, unknown>;
  if (humanColor !== "w" && humanColor !== "b") throw new Error("Saved game has an invalid humanColor");
  if (!DIFFICULTIES.some((known) => known === difficulty)) throw new Error("Saved game has an invalid difficulty");
  if (typeof resigned !== "boolean") throw new Error("Saved game has an invalid resigned flag");
  if (!Array.isArray(moves) || !moves.every((move) => typeof move === "string")) {
    throw new Error("Saved game moves must be a list of UCI strings");
  }
  try {
    replay(moves);
  } catch (error) {
    throw new Error(`Saved game has an illegal move: ${error instanceof Error ? error.message : String(error)}`);
  }
  // Both fields were checked against their allowed values above.
  return { humanColor, difficulty: difficulty as Difficulty, moves: [...moves] as string[], resigned };
};
