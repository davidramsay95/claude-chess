import { Game } from "./engine/game";
import { START_FEN } from "./engine/position";
import { summarize, validateState, type Difficulty, type GameState, type GameSummary, type PlayerColor } from "./state";

export type LoadOutcome = { ok: true } | { ok: false; error: string };

/**
 * The single owner of the current game. The interface and the save bridge both
 * go through `load`, so they share the same validation and replay logic.
 */
export class Session {
  game: Game | null = null;
  playerColor: PlayerColor = "white";
  difficulty: Difficulty = "medium";
  resigned = false;
  /** Called after every change to the game. */
  onChange: () => void = () => {};

  start(playerColor: PlayerColor, difficulty: Difficulty): void {
    this.game = new Game(START_FEN);
    this.playerColor = playerColor;
    this.difficulty = difficulty;
    this.resigned = false;
    this.onChange();
  }

  playMove(uci: string): boolean {
    if (this.game === null || this.resigned) return false;
    const played = this.game.playUci(uci);
    if (played) this.onChange();
    return played;
  }

  resign(): void {
    if (this.game === null || this.resigned) return;
    this.resigned = true;
    this.onChange();
  }

  /** Discards the game and returns to the setup screen. */
  clear(): void {
    this.game = null;
    this.resigned = false;
    this.onChange();
  }

  snapshot(): GameState | null {
    if (this.game === null) return null;
    return {
      version: 1,
      startFen: this.game.startFen,
      playerColor: this.playerColor,
      difficulty: this.difficulty,
      moves: [...this.game.moves],
      resigned: this.resigned,
    };
  }

  summary(): GameSummary | null {
    const state = this.snapshot();
    if (state === null || this.game === null) return null;
    return summarize(state, this.game);
  }

  /** Replaces the current game with an imported one, or changes nothing and explains why. */
  load(raw: unknown): LoadOutcome {
    const parsed = validateState(raw);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    this.game = parsed.game;
    this.playerColor = parsed.state.playerColor;
    this.difficulty = parsed.state.difficulty;
    this.resigned = parsed.state.resigned;
    this.onChange();
    return { ok: true };
  }
}
