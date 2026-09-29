import { Game, type PlayedMove } from "../core/game";
import type { Difficulty } from "../engine/difficulty";
import {
  buildGameState,
  parseGameState,
  parseGameStateText,
  summarize,
  toCoreColor,
  type GameStateV1,
  type GameSummary,
  type ParseOutcome,
  type PlayerColor,
} from "./gameState";

// Re-exported because callers of the session API need the type; it is defined with the save format.
export type { PlayerColor } from "./gameState";

/** Read-only view of a session, for renderers that should not mutate it. */
export interface SessionSnapshot {
  game: Game | null;
  playerColor: PlayerColor;
  difficulty: Difficulty;
}

/** Result of an import: a short readable error on failure. */
export type ImportResult = { ok: true } | { ok: false; error: string };

/**
 * The single owner of the current game and its settings. The UI and the save bridge both go
 * through this class, so a game loaded from the shell behaves exactly like one imported by hand.
 * It holds no DOM references so it can be tested in node.
 */
export class ChessSession {
  private currentGame: Game | null = null;
  private currentPlayerColor: PlayerColor = "white";
  private currentDifficulty: Difficulty = "medium";
  private readonly listeners = new Set<() => void>();

  /** The live game, or null on the setup screen. */
  get game(): Game | null {
    return this.currentGame;
  }

  /** The human's colour for the current game (or the last one chosen). */
  get playerColor(): PlayerColor {
    return this.currentPlayerColor;
  }

  /** Engine strength for the current game (or the last one chosen). */
  get difficulty(): Difficulty {
    return this.currentDifficulty;
  }

  /** Current game and settings as one object. */
  snapshot(): SessionSnapshot {
    return { game: this.currentGame, playerColor: this.currentPlayerColor, difficulty: this.currentDifficulty };
  }

  /** Starts a new game from the standard position. */
  newGame(playerColor: PlayerColor, difficulty: Difficulty): void {
    this.replace(new Game(), playerColor, difficulty);
  }

  /** Plays a UCI move for whichever side is to move. Throws with no game or an illegal move. */
  playMove(uci: string): PlayedMove {
    const played = this.requireGame().play(uci);
    this.notify();
    return played;
  }

  /** The human resigns. Throws with no game or when the game is already over. */
  resign(): void {
    this.requireGame().resign(toCoreColor(this.currentPlayerColor));
    this.notify();
  }

  /** The current game as a saved state, or null on the setup screen. */
  exportState(): GameStateV1 | null {
    if (this.currentGame === null) return null;
    return buildGameState(this.currentGame, this.currentPlayerColor, this.currentDifficulty);
  }

  /** Result and half-move count, or null on the setup screen. */
  summary(): GameSummary | null {
    return this.currentGame === null ? null : summarize(this.currentGame);
  }

  /** Replaces the game with a saved state. Atomic: on failure nothing changes and nobody is notified. */
  importState(input: unknown): ImportResult {
    return this.adopt(parseGameState(input));
  }

  /** Same as {@link importState} but from JSON text such as an uploaded file. */
  importText(text: string): ImportResult {
    return this.adopt(parseGameStateText(text));
  }

  /** Registers a listener called after every successful change. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  /** True when a game is in progress and the human is to move. */
  isHumanTurn(): boolean {
    const game = this.currentGame;
    if (game === null || game.status().result !== "*") return false;
    return game.position.turn === toCoreColor(this.currentPlayerColor);
  }

  /** Drops the current game and returns to the setup screen, keeping the last settings as defaults. */
  backToSetup(): void {
    this.currentGame = null;
    this.notify();
  }

  private adopt(outcome: ParseOutcome): ImportResult {
    if (!outcome.ok) return { ok: false, error: outcome.error };
    const { game, state } = outcome.loaded;
    this.replace(game, state.playerColor, state.difficulty);
    return { ok: true };
  }

  private replace(game: Game, playerColor: PlayerColor, difficulty: Difficulty): void {
    this.currentGame = game;
    this.currentPlayerColor = playerColor;
    this.currentDifficulty = difficulty;
    this.notify();
  }

  private requireGame(): Game {
    if (this.currentGame === null) throw new Error("No game in progress");
    return this.currentGame;
  }

  private notify(): void {
    // Copy first so a listener that unsubscribes during notification does not skip another.
    for (const listener of [...this.listeners]) listener();
  }
}
