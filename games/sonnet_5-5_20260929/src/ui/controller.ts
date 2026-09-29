import type { Session } from "../session";
import type { Difficulty } from "../state";

/** The part of EngineClient the controller needs, so tests can substitute a fake. */
export interface MoveSearcher {
  search(startFen: string, moves: string[], difficulty: Difficulty): Promise<string | null>;
  cancel(): void;
}

interface ActiveSearch {
  generation: number;
  gameKey: object;
  ply: number;
}

/**
 * Asks the engine to move whenever it is the engine's turn in a live game.
 * Results are only applied if the very same game is still at the very same ply,
 * which covers new games, imports (UI or bridge), resignation and returning to setup.
 */
export class EngineController {
  private generation = 0;
  private active: ActiveSearch | null = null;

  constructor(
    private readonly session: Session,
    private readonly engine: MoveSearcher,
    private readonly onThinkingChange: (thinking: boolean) => void,
    private readonly minimumDelayMs = 0,
  ) {}

  get thinking(): boolean {
    return this.active !== null;
  }

  /** Reconciles the running search with the session. Safe to call on every change. */
  sync(): void {
    const game = this.session.game;
    if (game === null || this.session.resigned || game.status().result !== "*") {
      this.stop();
      return;
    }
    const engineToMove = (game.position.side === 0 ? "white" : "black") !== this.session.playerColor;
    if (!engineToMove) {
      this.stop();
      return;
    }
    const ply = game.moves.length;
    if (this.active !== null && this.active.gameKey === game && this.active.ply === ply) return;

    this.stop();
    void this.run(game, ply);
  }

  /** Abandons any search. Used when leaving the game screen. */
  cancel(): void {
    this.stop();
  }

  private stop(): void {
    if (this.active === null) return;
    this.generation++;
    this.active = null;
    this.engine.cancel();
    this.onThinkingChange(false);
  }

  private async run(game: NonNullable<Session["game"]>, ply: number): Promise<void> {
    const generation = ++this.generation;
    this.active = { generation, gameKey: game, ply };
    this.onThinkingChange(true);

    const startedAt = Date.now();
    const move = await this.engine.search(game.startFen, [...game.moves], this.session.difficulty);
    const remaining = this.minimumDelayMs - (Date.now() - startedAt);
    if (move !== null && remaining > 0) await new Promise<void>((resolve) => setTimeout(resolve, remaining));

    if (this.generation !== generation || this.active === null) return;
    const stillCurrent = this.session.game === game && game.moves.length === ply && !this.session.resigned;
    this.active = null;
    this.onThinkingChange(false);
    // Play through the session so the interface and bridge see the change.
    if (stillCurrent && move !== null) this.session.playMove(move);
  }
}
