import type { Game } from "../engine/game";
import { movesToSan } from "../engine/san";
import type { Session } from "../session";
import { Board } from "./board";
import { button, el, icon, iconButton } from "./dom";
import { copyText, downloadState, serializeState } from "./exporter";
import { DIFFICULTY_TEXT } from "./setup";
import {
  describeOutcome,
  lastMoveOf,
  pairMoves,
  positionAtPly,
  stepPly,
  type HistoryStep,
  type Outcome,
} from "./model";
import { MoveList } from "./moveList";

export interface GameScreenHooks {
  isThinking: () => boolean;
  /** Cancels the engine before the session is cleared. */
  cancelEngine: () => void;
  openImport: () => void;
}

const isTextEntry = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * The in-game screen. It owns only view state (which ply is shown, board
 * orientation, pending confirmations); the game itself lives in the Session.
 */
export class GameScreen {
  readonly root: HTMLElement;
  private readonly board: Board;
  private readonly moveList: MoveList;
  private readonly statusBar: HTMLElement;
  private readonly statusText: HTMLElement;
  private readonly statusChips: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly historyNotice: HTMLElement;
  private readonly historyLabel: HTMLElement;
  private readonly opponentLabel: HTMLElement;
  private readonly playerLabel: HTMLElement;
  private readonly navButtons: Record<HistoryStep, HTMLButtonElement>;
  private readonly resignSlot: HTMLElement;
  private readonly exportNote: HTMLElement;
  private readonly exportText: HTMLTextAreaElement;

  private shownGame: Game | null = null;
  private viewPly: number | null = null;
  private flipped = false;
  private confirmingResign = false;
  private sanCache: { game: Game; length: number; sans: string[] } | null = null;
  private positionCache: { game: Game; ply: number; position: ReturnType<typeof positionAtPly> } | null = null;

  constructor(
    private readonly session: Session,
    private readonly hooks: GameScreenHooks,
  ) {
    this.board = new Board((uci) => this.handleBoardMove(uci));
    this.moveList = new MoveList((ply) => this.showPly(ply));

    this.statusText = el("span", { className: "status-text" });
    this.statusChips = el("span", { className: "status-chips" });
    this.statusBar = el("div", { className: "status-bar", attrs: { role: "status", "aria-live": "polite" } }, this.statusText, this.statusChips);
    this.banner = el("div", { className: "banner", attrs: { role: "status" } });
    this.banner.hidden = true;

    this.historyLabel = el("span", { className: "history-label" });
    this.historyNotice = el(
      "div",
      { className: "history-notice" },
      this.historyLabel,
      button("Back to live", "btn btn-small btn-primary", () => this.showPly(null)),
    );
    this.historyNotice.hidden = true;

    this.opponentLabel = el("span", { className: "strip-name" });
    this.playerLabel = el("span", { className: "strip-name" });

    const thinkingDots = el("span", { className: "thinking-dots", attrs: { "aria-hidden": "true" } }, el("i"), el("i"), el("i"));
    this.statusBar.prepend(thinkingDots);

    this.navButtons = {
      first: iconButton("first", "First move", () => this.step("first")),
      prev: iconButton("prev", "Previous move", () => this.step("prev")),
      next: iconButton("next", "Next move", () => this.step("next")),
      last: iconButton("last", "Latest move", () => this.step("last")),
    };
    const nav = el(
      "div",
      { className: "history-nav", attrs: { role: "group", "aria-label": "Move history" } },
      this.navButtons.first,
      this.navButtons.prev,
      this.navButtons.next,
      this.navButtons.last,
    );

    this.resignSlot = el("div", { className: "resign-slot" });
    this.exportNote = el("p", { className: "export-note", attrs: { role: "status" } });
    this.exportNote.hidden = true;
    this.exportText = el("textarea", { className: "export-text", attrs: { readonly: "", rows: "5", "aria-label": "Exported game JSON" } });
    this.exportText.hidden = true;

    const flip = el("button", { className: "btn", attrs: { type: "button" } }, icon("flip"), "Flip board");
    flip.addEventListener("click", () => {
      this.flipped = !this.flipped;
      this.render();
    });
    const exportButton = el("button", { className: "btn", attrs: { type: "button" } }, icon("download"), "Export");
    exportButton.addEventListener("click", () => this.exportGame());
    const copy = el("button", { className: "btn", attrs: { type: "button" } }, icon("copy"), "Copy");
    copy.addEventListener("click", () => void this.copyGame());
    const importButton = el("button", { className: "btn", attrs: { type: "button" } }, icon("upload"), "Import");
    importButton.addEventListener("click", () => this.hooks.openImport());
    const newGame = el("button", { className: "btn", attrs: { type: "button" } }, icon("plus"), "New game");
    newGame.addEventListener("click", () => this.newGame());

    const controls = el(
      "div",
      { className: "controls" },
      el("div", { className: "control-row" }, flip, newGame, this.resignSlot),
      el("div", { className: "control-row" }, exportButton, copy, importButton),
      this.exportNote,
      this.exportText,
    );

    const stage = el(
      "section",
      { className: "stage", attrs: { "aria-label": "Game board" } },
      this.statusBar,
      this.banner,
      el("div", { className: "strip strip-top" }, el("span", { className: "strip-mark" }), this.opponentLabel),
      this.historyNotice,
      this.board.root,
      el("div", { className: "strip strip-bottom" }, el("span", { className: "strip-mark strip-mark-you" }), this.playerLabel),
    );
    const panel = el(
      "aside",
      { className: "panel", attrs: { "aria-label": "Moves and controls" } },
      el("h2", { className: "panel-title", text: "Moves" }),
      nav,
      this.moveList.root,
      controls,
    );
    this.root = el("main", { className: "game" }, stage, panel);
    document.addEventListener("keydown", this.handleKeyDown);
  }

  render(): void {
    const game = this.session.game;
    if (game === null) return;
    if (this.shownGame !== game) {
      this.shownGame = game;
      this.viewPly = null;
      this.flipped = this.session.playerColor === "black";
      this.confirmingResign = false;
      this.exportNote.hidden = true;
      this.exportText.hidden = true;
    }
    const total = game.moves.length;
    if (this.viewPly !== null && this.viewPly >= total) this.viewPly = null;
    const ply = this.viewPly ?? total;
    const live = this.viewPly === null;
    const status = game.status();
    const outcome = describeOutcome(status, this.session.playerColor, this.session.resigned);
    const humanSide = this.session.playerColor === "white" ? 0 : 1;
    const humanTurn = game.position.side === humanSide;
    const engineThinking = this.hooks.isThinking() && outcome === null;

    this.board.update({
      position: this.positionFor(game, ply),
      flipped: this.flipped,
      lastMove: lastMoveOf(game.moves, ply),
      interactive: live && outcome === null && humanTurn && !engineThinking,
      playerColor: this.session.playerColor,
    });
    this.board.root.classList.toggle("viewing", !live);

    this.renderStatus(game, outcome, engineThinking, humanTurn);
    this.renderHistory(game, ply, live);
    this.renderLabels();
    this.renderResign(outcome !== null);
  }

  private positionFor(game: Game, ply: number): ReturnType<typeof positionAtPly> {
    if (ply >= game.moves.length) return game.position;
    const cached = this.positionCache;
    if (cached !== null && cached.game === game && cached.ply === ply) return cached.position;
    const position = positionAtPly(game, ply);
    this.positionCache = { game, ply, position };
    return position;
  }

  private sansFor(game: Game): string[] {
    const cached = this.sanCache;
    if (cached !== null && cached.game === game && cached.length === game.moves.length) return cached.sans;
    const sans = movesToSan(game.startFen, game.moves);
    this.sanCache = { game, length: game.moves.length, sans };
    return sans;
  }

  private renderStatus(game: Game, outcome: Outcome | null, thinking: boolean, humanTurn: boolean): void {
    this.banner.hidden = outcome === null;
    this.statusBar.hidden = outcome !== null;
    if (outcome !== null) {
      this.banner.className = `banner banner-${outcome.tone}`;
      this.banner.replaceChildren(
        el("span", { className: "banner-headline", text: outcome.headline }),
        el("span", { className: "banner-detail", text: outcome.detail }),
      );
      return;
    }
    this.statusBar.classList.toggle("is-thinking", thinking);
    this.statusText.textContent = thinking
      ? "Engine is thinking..."
      : humanTurn
        ? `Your move, ${this.session.playerColor === "white" ? "White" : "Black"}`
        : "Waiting for the engine";
    this.statusChips.replaceChildren();
    if (game.position.inCheck()) this.statusChips.append(el("span", { className: "chip chip-check", text: "Check" }));
  }

  private renderHistory(game: Game, ply: number, live: boolean): void {
    const total = game.moves.length;
    const rows = pairMoves(this.sansFor(game), game.startFen);
    this.moveList.update(rows, ply, live);
    this.historyNotice.hidden = live;
    this.historyLabel.textContent = ply === 0 ? "Viewing the starting position" : `Viewing the position after move ${ply} of ${total}`;
    this.navButtons.first.disabled = ply === 0;
    this.navButtons.prev.disabled = ply === 0;
    this.navButtons.next.disabled = live;
    this.navButtons.last.disabled = live;
  }

  private renderLabels(): void {
    const level = DIFFICULTY_TEXT[this.session.difficulty].label;
    const humanIsWhite = this.session.playerColor === "white";
    const engineLabel = `Engine, ${level}`;
    const youLabel = `You, ${humanIsWhite ? "White" : "Black"}`;
    const engineOnTop = this.flipped ? !humanIsWhite : humanIsWhite;
    this.opponentLabel.textContent = engineOnTop ? engineLabel : youLabel;
    this.playerLabel.textContent = engineOnTop ? youLabel : engineLabel;
    this.root.querySelector(".strip-top .strip-mark")?.classList.toggle("strip-mark-you", !engineOnTop);
    this.root.querySelector(".strip-bottom .strip-mark")?.classList.toggle("strip-mark-you", engineOnTop);
  }

  private renderResign(gameOver: boolean): void {
    this.resignSlot.replaceChildren();
    if (gameOver) {
      this.confirmingResign = false;
      return;
    }
    if (!this.confirmingResign) {
      const resign = el("button", { className: "btn btn-danger", attrs: { type: "button" } }, icon("flag"), "Resign");
      resign.addEventListener("click", () => {
        this.confirmingResign = true;
        this.renderResign(false);
        this.resignSlot.querySelector<HTMLElement>(".btn-danger-solid")?.focus();
      });
      this.resignSlot.append(resign);
      return;
    }
    const yes = button("Yes, resign", "btn btn-small btn-danger-solid", () => {
      this.confirmingResign = false;
      this.session.resign();
    });
    const no = button("Keep playing", "btn btn-small btn-quiet", () => {
      this.confirmingResign = false;
      this.renderResign(false);
    });
    this.resignSlot.append(
      el("div", { className: "confirm", attrs: { role: "group", "aria-label": "Confirm resignation" } }, el("span", { className: "confirm-text", text: "Resign this game?" }), yes, no),
    );
  }

  private handleBoardMove(uci: string): void {
    if (this.viewPly !== null) return;
    this.session.playMove(uci);
  }

  private showPly(ply: number | null): void {
    const total = this.session.game?.moves.length ?? 0;
    this.viewPly = ply === null || ply >= total ? null : Math.max(0, ply);
    this.render();
  }

  private step(action: HistoryStep): void {
    const total = this.session.game?.moves.length ?? 0;
    this.viewPly = stepPly(this.viewPly, total, action);
    this.render();
  }

  private newGame(): void {
    this.hooks.cancelEngine();
    this.session.clear();
  }

  private exportGame(): void {
    const state = this.session.snapshot();
    if (state === null) return;
    downloadState(state);
    this.note("Game downloaded as a .json file.");
  }

  private async copyGame(): Promise<void> {
    const state = this.session.snapshot();
    if (state === null) return;
    const text = serializeState(state);
    const copied = await copyText(text);
    if (copied) {
      this.exportText.hidden = true;
      this.note("Game copied to the clipboard.");
      return;
    }
    // Clipboard is unavailable (common in iframes), so offer the text to copy by hand.
    this.exportText.value = text;
    this.exportText.hidden = false;
    this.exportText.select();
    this.note("Copying is blocked here. Select the text below and copy it manually.");
  }

  private note(message: string): void {
    this.exportNote.hidden = false;
    this.exportNote.textContent = message;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.root.isConnected || event.defaultPrevented) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (isTextEntry(event.target) || document.querySelector(".dialog-backdrop:not([hidden])") !== null) return;
    if (this.root.querySelector(".promotion") !== null) return;
    const steps: Record<string, HistoryStep> = { ArrowLeft: "prev", ArrowRight: "next", Home: "first", End: "last" };
    const action = steps[event.key];
    if (action === undefined) return;
    event.preventDefault();
    this.step(action);
  };
}
