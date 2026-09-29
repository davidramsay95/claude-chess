import { moveToUci, NO_MOVE } from "../chess/move";
import { Position } from "../chess/position";
import { chooseEngineMove, DIFFICULTY_SETTINGS, type DifficultySettings } from "./difficulty";
import { type Difficulty, DIFFICULTIES, type EngineRequest, type EngineResponse } from "./protocol";
import { bookMove } from "./openingBook";
import { Searcher } from "./search";
import type { Rng } from "./seededRandom";

export interface EngineRequestOptions {
  /** Defaults to one shared searcher, so its transposition table carries over between moves of a game. */
  searcher?: Searcher;
  /** Defaults to `Math.random`. */
  rng?: Rng;
}

let sharedSearcher: Searcher | null = null;

const getSharedSearcher = (): Searcher => {
  sharedSearcher ??= new Searcher();
  return sharedSearcher;
};

/** Rebuilds the game from its start so the search can see earlier positions for repetition draws. */
const replayGame = (startFen: string, moves: readonly string[]): Position => {
  const position = Position.fromFen(startFen);
  moves.forEach((uci, index) => {
    const move = position.parseUci(uci);
    if (move === NO_MOVE) throw new Error(`Illegal move "${uci}" at index ${index}`);
    position.makeMove(move);
  });
  return position;
};

const isDifficulty = (value: string): value is Difficulty => DIFFICULTIES.some((level) => level === value);

/** Worker messages are untyped at runtime, so the difficulty is validated rather than trusted. */
const settingsFor = (difficulty: string): DifficultySettings => {
  if (!isDifficulty(difficulty)) throw new Error(`Unknown difficulty "${difficulty}"`);
  return DIFFICULTY_SETTINGS[difficulty];
};

/**
 * Answers one engine request with the move to play in UCI notation. Never throws: every failure,
 * including a malformed FEN or an illegal move in the history, becomes an `ok: false` response.
 */
export const handleEngineRequest = (request: EngineRequest, options: EngineRequestOptions = {}): EngineResponse => {
  const { id } = request;
  try {
    const settings = settingsFor(request.difficulty);
    const position = replayGame(request.startFen, request.moves);
    if (position.generateLegalMoves().length === 0) throw new Error("No legal moves: the game is already over");
    const rng = options.rng ?? Math.random;
    const theory = settings.useOpeningBook ? bookMove(request.startFen, request.moves, rng) : null;
    if (theory) return { id, ok: true, move: theory };
    const move = chooseEngineMove(position, settings, options.searcher ?? getSharedSearcher(), rng);
    return { id, ok: true, move: moveToUci(move) };
  } catch (error) {
    return { id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};
