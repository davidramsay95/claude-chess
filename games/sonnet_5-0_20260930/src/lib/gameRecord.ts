/**
 * The app-level notion of "a game in progress", plus the export/import
 * format shared with the platform's save bridge (see `src/lib/bridge.ts`).
 *
 * `validateAndReplay` is the single source of truth for turning untrusted
 * JSON into a `GameRecord`: both the in-UI "Import game" feature
 * (`src/components/ImportExportPanel.tsx`) and the postMessage `load-state`
 * handler (`src/lib/bridge.ts`) call this exact function, so they can never
 * drift apart. It never mutates or reads any existing game state — it only
 * builds a brand new `GameRecord` from scratch — so a failed import can
 * never corrupt whatever game the caller is already holding.
 */

import { createGame, getStatus, getWinner, makeMove, toFen, uciToMove } from "../engine/index";
import type { Color, GameState } from "../engine/index";
import type { Difficulty } from "../ai/index";

const VALID_COLORS: readonly string[] = ["white", "black"];
const VALID_DIFFICULTIES: readonly string[] = ["easy", "medium", "hard", "expert"];

/** The cross-model portable save format. Do not change this shape. */
export interface ExportedGameState {
  version: 1;
  startFen: string;
  playerColor: Color;
  difficulty: Difficulty;
  moves: string[];
  resigned: boolean;
}

export interface MoveRecord {
  /** UCI form, e.g. `'e2e4'`, `'e1g1'` (castling), `'e7e8q'` (promotion). */
  uci: string;
  /** Standard Algebraic Notation, for display in the move list. */
  san: string;
}

/** The app's in-memory representation of the game currently on screen. */
export interface GameRecord {
  startFen: string;
  playerColor: Color;
  difficulty: Difficulty;
  moves: readonly MoveRecord[];
  state: GameState;
  resigned: boolean;
}

export type GameResult = "1-0" | "0-1" | "1/2-1/2" | "*";

export interface GameSummary {
  result: GameResult;
  moveCount: number;
}

export type ImportResult = { ok: true; record: GameRecord } | { ok: false; error: string };

/** Creates a brand new `GameRecord` for the standard starting position. */
export function createNewGameRecord(playerColor: Color, difficulty: Difficulty): GameRecord {
  const state = createGame();
  return {
    startFen: toFen(state),
    playerColor,
    difficulty,
    moves: [],
    state,
    resigned: false,
  };
}

/** Produces the portable export shape for the current game. */
export function exportGame(record: GameRecord): ExportedGameState {
  return {
    version: 1,
    startFen: record.startFen,
    playerColor: record.playerColor,
    difficulty: record.difficulty,
    moves: record.moves.map((move) => move.uci),
    resigned: record.resigned,
  };
}

/** Result summary used by the move-list header and the save bridge. */
export function computeSummary(record: GameRecord): GameSummary {
  const moveCount = record.moves.length;

  if (record.resigned) {
    const winner: Color = record.playerColor === "white" ? "black" : "white";
    return { result: winner === "white" ? "1-0" : "0-1", moveCount };
  }

  const status = getStatus(record.state);
  if (status === "checkmate") {
    const winner = getWinner(record.state);
    return { result: winner === "white" ? "1-0" : "0-1", moveCount };
  }
  if (status !== "active") {
    return { result: "1/2-1/2", moveCount };
  }
  return { result: "*", moveCount };
}

/**
 * Validates an arbitrary (untrusted) value as an `ExportedGameState` and, if
 * every field is well-formed, replays every move through the real engine
 * starting from `startFen`. Returns `{ ok: false, error }` on the first
 * problem found (malformed shape, unsupported version, or an illegal /
 * unparseable move) without ever throwing.
 */
export function validateAndReplay(raw: unknown): ImportResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Expected a JSON object." };
  }
  const obj = raw as Record<string, unknown>;

  if (obj.version !== 1) {
    return { ok: false, error: `Unsupported save version: ${JSON.stringify(obj.version)}.` };
  }
  if (typeof obj.startFen !== "string" || obj.startFen.trim() === "") {
    return { ok: false, error: "Missing or invalid \"startFen\"." };
  }
  if (typeof obj.playerColor !== "string" || !VALID_COLORS.includes(obj.playerColor)) {
    return { ok: false, error: "Missing or invalid \"playerColor\" (expected \"white\" or \"black\")." };
  }
  if (typeof obj.difficulty !== "string" || !VALID_DIFFICULTIES.includes(obj.difficulty)) {
    return { ok: false, error: "Missing or invalid \"difficulty\"." };
  }
  if (!Array.isArray(obj.moves) || !obj.moves.every((entry) => typeof entry === "string")) {
    return { ok: false, error: "Missing or invalid \"moves\" array." };
  }
  if (typeof obj.resigned !== "boolean") {
    return { ok: false, error: "Missing or invalid \"resigned\" flag." };
  }

  let state: GameState;
  try {
    state = createGame(obj.startFen);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Invalid "startFen": ${message}` };
  }

  const moves: MoveRecord[] = [];
  for (const uci of obj.moves as string[]) {
    const move = uciToMove(state, uci);
    if (!move) {
      return { ok: false, error: `Unparseable move "${uci}" at position ${moves.length + 1}.` };
    }
    const result = makeMove(state, move);
    if (!result) {
      return { ok: false, error: `Illegal move "${uci}" at position ${moves.length + 1}.` };
    }
    moves.push({ uci, san: result.san ?? uci });
    state = result.state;
  }

  return {
    ok: true,
    record: {
      startFen: obj.startFen,
      playerColor: obj.playerColor as Color,
      difficulty: obj.difficulty as Difficulty,
      moves,
      state,
      resigned: obj.resigned,
    },
  };
}
