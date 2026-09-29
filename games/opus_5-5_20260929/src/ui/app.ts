import type { Game } from "../core/game";
import { Position, WHITE, moveFrom, moveTo } from "../core/position";
import { DIFFICULTIES, Difficulty } from "../engine/difficulty";
import type { EngineClient } from "../engine/engineClient";
import { serializeGameState } from "../state/gameState";
import type { ChessSession, PlayerColor } from "../state/session";
import { BoardView } from "./boardView";
import { pieceSvg } from "./pieces";
import { Side, describeStatus, scoresheetRows } from "./presenters";
import { SoundPlayer } from "./sound";
import { svgInstance } from "./svgInstance";

const LEVEL_NOTES: Record<Difficulty, string> = {
  easy: "Plays loosely and misses tactics. Good for learning.",
  medium: "Looks a few moves ahead and punishes loose pieces.",
  hard: "Solid tactics. Rarely hangs anything.",
  expert: "Full-strength search, about three seconds a move.",
};

const LEVEL_NAMES: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard", expert: "Expert" };
const MIN_ENGINE_DELAY_MS = 350;
const RESIGN_CONFIRM_MS = 3000;

type SideChoice = PlayerColor | "random";

const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

const button = (label: string, className: string, onClick: () => void): HTMLButtonElement => {
  const node = element("button", className, label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
};

/** Owns the DOM: the setup screen, the game screen and the export/import dialogs. */
export class App {
  private readonly root: HTMLElement;
  private readonly sound = new SoundPlayer();
  private readonly board: BoardView;
  private sideChoice: SideChoice = "white";
  private levelChoice: Difficulty = "medium";
  private showingSetup = true;
  /** Ply shown on the board while reviewing, or null for the live position. */
  private viewPly: number | null = null;
  private orientation: Side = "white";
  private thinking = false;
  private engineToken = 0;
  private knownGame: Game | null = null;
  private knownMoveCount = 0;
  private animateNext = false;
  private resignArmedUntil = 0;

  private readonly setupScreen = element("section", "setup");
  private readonly gameScreen = element("section", "game");
  private readonly statusLine = element("p", "status");
  private readonly engineStrip = element("div", "strip engine-strip");
  private readonly playerStrip = element("div", "strip player-strip");
  private readonly scoresheet = element("ol", "scoresheet");
  private readonly reviewNote = element("p", "review-note");
  private readonly navButtons: HTMLButtonElement[] = [];
  private readonly resignButton: HTMLButtonElement;
  private readonly soundButton: HTMLButtonElement;
  private readonly backToGameButton: HTMLButtonElement;
  private readonly exportDialog = element("dialog", "sheet");
  private readonly importDialog = element("dialog", "sheet");
  private readonly exportText = element("textarea", "state-text");
  private readonly importText = element("textarea", "state-text");
  private readonly importError = element("p", "form-error");
  private readonly copyNote = element("span", "copy-note");

  constructor(
    root: HTMLElement,
    private readonly session: ChessSession,
    private readonly engine: EngineClient,
  ) {
    this.root = root;
    this.board = new BoardView((uci) => this.playHumanMove(uci));
    this.resignButton = button("Resign", "action", () => this.handleResign());
    this.soundButton = button("", "action", () => this.toggleSound());
    this.backToGameButton = button("Back to game", "link-button", () => this.showGame());
    this.buildSetup();
    this.buildGame();
    this.buildDialogs();
    this.root.append(this.setupScreen, this.gameScreen, this.exportDialog, this.importDialog);
    this.session.subscribe(() => this.handleSessionChange());
    document.addEventListener("keydown", (event) => this.handleKey(event));
    this.render();
  }

  private buildSetup(): void {
    const title = element("h1", "title", "Opus Chess");
    const lede = element("p", "lede", "Play the engine. Choose your side and how hard it should push.");

    const sideGroup = element("div", "choice-row");
    sideGroup.setAttribute("role", "radiogroup");
    sideGroup.setAttribute("aria-label", "Your side");
    const sides: [SideChoice, string, string][] = [
      ["white", "White", svgInstance(pieceSvg("k", "w"))],
      ["black", "Black", svgInstance(pieceSvg("k", "b"))],
      ["random", "Random", svgInstance(pieceSvg("k", "w")) + svgInstance(pieceSvg("k", "b"))],
    ];
    for (const [value, label, art] of sides) {
      const option = button("", "choice side-choice", () => {
        this.sideChoice = value;
        this.renderSetup();
      });
      option.dataset.value = value;
      option.setAttribute("role", "radio");
      option.innerHTML = `<span class="choice-art">${art}</span>`;
      option.append(element("span", "choice-label", label));
      sideGroup.append(option);
    }

    const levelGroup = element("div", "level-list");
    levelGroup.setAttribute("role", "radiogroup");
    levelGroup.setAttribute("aria-label", "Engine level");
    for (const level of DIFFICULTIES) {
      const option = button("", "choice level-choice", () => {
        this.levelChoice = level;
        this.renderSetup();
      });
      option.dataset.value = level;
      option.setAttribute("role", "radio");
      option.append(element("span", "choice-label", LEVEL_NAMES[level]), element("span", "choice-note", LEVEL_NOTES[level]));
      levelGroup.append(option);
    }

    const start = button("Start game", "primary", () => this.startGame());
    const importLink = button("Import a saved game", "link-button", () => this.openImport());
    const footer = element("div", "setup-actions");
    footer.append(start, importLink, this.backToGameButton);

    const sideHeading = element("h2", "group-heading", "Your side");
    const levelHeading = element("h2", "group-heading", "Engine level");
    const card = element("div", "setup-card");
    card.append(title, lede, sideHeading, sideGroup, levelHeading, levelGroup, footer);
    this.setupScreen.append(card);
  }

  private buildGame(): void {
    const boardColumn = element("div", "board-column");
    boardColumn.append(this.engineStrip, this.board.element, this.playerStrip);

    const nav = element("div", "nav");
    const navSpecs: [string, string, () => void][] = [
      ["⏮", "First position", () => this.navigate(0)],
      ["◀", "Previous move", () => this.navigate((this.viewPly ?? this.liveMoveCount()) - 1)],
      ["▶", "Next move", () => this.navigate((this.viewPly ?? this.liveMoveCount()) + 1)],
      ["⏭", "Latest position", () => this.navigate(this.liveMoveCount())],
    ];
    for (const [glyph, label, action] of navSpecs) {
      const navButton = button(glyph, "nav-button", action);
      navButton.setAttribute("aria-label", label);
      navButton.title = label;
      this.navButtons.push(navButton);
      nav.append(navButton);
    }

    const actions = element("div", "actions");
    actions.append(
      button("New game", "action", () => this.showSetup()),
      this.resignButton,
      button("Flip board", "action", () => this.flip()),
      button("Export game", "action", () => this.openExport()),
      button("Import game", "action", () => this.openImport()),
      this.soundButton,
    );

    const sheetWrap = element("div", "sheet-wrap");
    sheetWrap.append(this.scoresheet);
    const panel = element("aside", "panel");
    panel.append(this.statusLine, this.reviewNote, sheetWrap, nav, actions);
    this.statusLine.setAttribute("role", "status");
    this.gameScreen.append(boardColumn, panel);
  }

  private buildDialogs(): void {
    this.exportText.readOnly = true;
    this.exportText.setAttribute("aria-label", "Saved game JSON");
    const exportActions = element("div", "dialog-actions");
    exportActions.append(
      button("Download .json", "primary", () => this.downloadExport()),
      button("Copy", "action", () => void this.copyExport()),
      this.copyNote,
      button("Close", "link-button", () => this.exportDialog.close()),
    );
    this.exportDialog.append(
      element("h2", "dialog-title", "Export game"),
      element("p", "dialog-note", "Save this file to replay or continue the game later."),
      this.exportText,
      exportActions,
    );

    this.importText.placeholder = '{ "version": 1, "startFen": "...", "moves": ["e2e4", ...] }';
    this.importText.setAttribute("aria-label", "Paste a saved game");
    const fileInput = element("input", "file-input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json,text/plain";
    fileInput.setAttribute("aria-label", "Choose a saved game file");
    fileInput.addEventListener("change", () => void this.readImportFile(fileInput));
    const importActions = element("div", "dialog-actions");
    importActions.append(
      button("Import", "primary", () => this.submitImport()),
      button("Cancel", "link-button", () => this.importDialog.close()),
    );
    this.importError.setAttribute("role", "alert");
    this.importDialog.append(
      element("h2", "dialog-title", "Import game"),
      element("p", "dialog-note", "Choose a saved .json file or paste its contents. The moves are replayed and checked before anything changes."),
      fileInput,
      this.importText,
      this.importError,
      importActions,
    );
  }

  private liveMoveCount(): number {
    return this.session.game?.moves.length ?? 0;
  }

  private startGame(): void {
    const color: PlayerColor =
      this.sideChoice === "random" ? (Math.random() < 0.5 ? "white" : "black") : this.sideChoice;
    this.orientation = color;
    this.showingSetup = false;
    this.session.newGame(color, this.levelChoice);
  }

  private showSetup(): void {
    this.showingSetup = true;
    this.render();
  }

  private showGame(): void {
    if (!this.session.game) return;
    this.showingSetup = false;
    this.render();
  }

  private playHumanMove(uci: string): void {
    if (this.viewPly !== null || !this.session.isHumanTurn()) return;
    try {
      this.session.playMove(uci);
    } catch (error) {
      console.error("Move rejected", error);
      this.render();
    }
  }

  /** Reacts to any session change, whether from the UI, the engine or the save bridge. */
  private handleSessionChange(): void {
    const game = this.session.game;
    if (game !== this.knownGame) {
      this.engineToken += 1;
      this.engine.cancel();
      this.thinking = false;
      this.knownGame = game;
      this.knownMoveCount = game?.moves.length ?? 0;
      this.viewPly = null;
      this.orientation = this.session.playerColor;
      if (game) this.showingSetup = false;
    } else if (game && game.moves.length !== this.knownMoveCount) {
      this.knownMoveCount = game.moves.length;
      this.viewPly = null;
      this.playMoveSound(game);
    } else if (game && game.status().result !== "*") {
      this.sound.play("end");
    }
    this.render();
    void this.requestEngineMoveIfNeeded();
  }

  private playMoveSound(game: Game): void {
    const last = game.moves[game.moves.length - 1];
    if (!last) return;
    const status = game.status();
    if (status.result !== "*") this.sound.play("end");
    else if (status.inCheck) this.sound.play("check");
    else this.sound.play(last.captured ? "capture" : "move");
  }

  private async requestEngineMoveIfNeeded(): Promise<void> {
    const game = this.session.game;
    if (!game || this.thinking || game.status().result !== "*" || this.session.isHumanTurn()) return;
    const token = ++this.engineToken;
    this.thinking = true;
    this.render();
    const started = performance.now();
    try {
      const result = await this.engine.requestMove({
        startFen: game.startFen,
        moves: game.moves.map((move) => move.uci),
        difficulty: this.session.difficulty,
      });
      const elapsed = performance.now() - started;
      if (elapsed < MIN_ENGINE_DELAY_MS) await sleep(MIN_ENGINE_DELAY_MS - elapsed);
      if (token !== this.engineToken || this.session.game !== game) return;
      this.thinking = false;
      this.animateNext = true;
      this.session.playMove(result.move);
    } catch (error) {
      if (token !== this.engineToken) return;
      this.thinking = false;
      if (error instanceof Error && error.message === "cancelled") return;
      console.error("Engine failed", error);
      this.statusLine.textContent = "The engine hit an error. Start a new game or import one to continue.";
    }
  }

  private navigate(ply: number): void {
    const live = this.liveMoveCount();
    const clamped = Math.max(0, Math.min(live, ply));
    // Only a single step forward reads as a move being played; bigger jumps just redraw.
    this.animateNext = clamped === (this.viewPly ?? live) + 1;
    this.viewPly = clamped === live ? null : clamped;
    this.render();
  }

  private flip(): void {
    this.orientation = this.orientation === "white" ? "black" : "white";
    this.render();
  }

  private handleResign(): void {
    const game = this.session.game;
    if (!game || game.status().result !== "*") return;
    if (Date.now() > this.resignArmedUntil) {
      this.resignArmedUntil = Date.now() + RESIGN_CONFIRM_MS;
      this.renderResignButton();
      setTimeout(() => this.renderResignButton(), RESIGN_CONFIRM_MS + 50);
      return;
    }
    this.resignArmedUntil = 0;
    this.engineToken += 1;
    this.engine.cancel();
    this.thinking = false;
    this.session.resign();
  }

  private toggleSound(): void {
    this.sound.setEnabled(!this.sound.enabled);
    this.renderSoundButton();
  }

  private handleKey(event: KeyboardEvent): void {
    if (this.showingSetup || this.exportDialog.open || this.importDialog.open) return;
    const target = event.target;
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) return;
    const current = this.viewPly ?? this.liveMoveCount();
    if (event.key === "ArrowLeft") this.navigate(current - 1);
    else if (event.key === "ArrowRight") this.navigate(current + 1);
    else if (event.key === "Home") this.navigate(0);
    else if (event.key === "End") this.navigate(this.liveMoveCount());
    else return;
    event.preventDefault();
  }

  private openExport(): void {
    const state = this.session.exportState();
    if (!state) return;
    this.exportText.value = serializeGameState(state);
    this.copyNote.textContent = "";
    this.exportDialog.showModal();
  }

  private downloadExport(): void {
    const blob = new Blob([this.exportText.value], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = element("a");
    link.href = url;
    link.download = `opus-chess-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private async copyExport(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.exportText.value);
      this.copyNote.textContent = "Copied";
    } catch (error) {
      console.warn("Clipboard write failed", error);
      this.exportText.select();
      this.copyNote.textContent = "Select the text and copy it manually";
    }
  }

  private openImport(): void {
    this.importText.value = "";
    this.importError.textContent = "";
    this.importDialog.showModal();
    this.importText.focus();
  }

  private async readImportFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    if (!file) return;
    try {
      this.importText.value = await file.text();
      this.importError.textContent = "";
    } catch (error) {
      console.error("Could not read the file", error);
      this.importError.textContent = "That file could not be read.";
    }
    input.value = "";
  }

  private submitImport(): void {
    const outcome = this.session.importText(this.importText.value);
    if (!outcome.ok) {
      this.importError.textContent = outcome.error;
      return;
    }
    this.importDialog.close();
  }

  private render(): void {
    const game = this.session.game;
    const onSetup = this.showingSetup || !game;
    this.setupScreen.hidden = !onSetup;
    this.gameScreen.hidden = onSetup;
    this.renderSetup();
    if (!game || onSetup) return;
    this.renderBoard(game);
    this.renderPanel(game);
  }

  private renderSetup(): void {
    this.setupScreen.querySelectorAll<HTMLButtonElement>(".side-choice").forEach((option) => {
      option.setAttribute("aria-checked", String(option.dataset.value === this.sideChoice));
    });
    this.setupScreen.querySelectorAll<HTMLButtonElement>(".level-choice").forEach((option) => {
      option.setAttribute("aria-checked", String(option.dataset.value === this.levelChoice));
    });
    this.backToGameButton.hidden = !this.session.game;
  }

  private renderBoard(game: Game): void {
    const live = this.viewPly === null;
    const ply = this.viewPly ?? game.moves.length;
    const position = live ? game.position : Position.fromFen(game.fenAt(ply));
    const last = ply > 0 ? game.moves[ply - 1] : null;
    const kingInCheck = position.inCheck() ? position.kingSquare[position.turn] : -1;
    const humanTurn = live && !this.thinking && this.session.isHumanTurn();
    this.board.render({
      position,
      orientation: this.orientation,
      lastMove: last ? { from: moveFrom(last.move), to: moveTo(last.move) } : null,
      checkSquare: kingInCheck,
      movable: humanTurn ? game.legalMoves() : [],
      animate: this.animateNext,
    });
    this.animateNext = false;
  }

  private renderPanel(game: Game): void {
    const status = game.status();
    const sideToMove: Side = game.position.turn === WHITE ? "white" : "black";
    const text = describeStatus(status, sideToMove, this.session.playerColor);
    this.statusLine.textContent = text;
    this.statusLine.classList.toggle("over", status.result !== "*");

    const engineColor = this.session.playerColor === "white" ? "b" : "w";
    const playerColor = this.session.playerColor === "white" ? "w" : "b";
    const engineOnTop = this.orientation === this.session.playerColor;
    this.renderStrip(this.engineStrip, engineOnTop ? "engine" : "player", engineOnTop ? engineColor : playerColor);
    this.renderStrip(this.playerStrip, engineOnTop ? "player" : "engine", engineOnTop ? playerColor : engineColor);

    this.renderScoresheet(game);
    const reviewing = this.viewPly !== null;
    this.reviewNote.hidden = !reviewing;
    this.reviewNote.textContent = reviewing ? `Reviewing after move ${Math.ceil((this.viewPly ?? 0) / 2)}. Press ⏭ to return to the game.` : "";
    const current = this.viewPly ?? game.moves.length;
    this.navButtons[0].disabled = current === 0;
    this.navButtons[1].disabled = current === 0;
    this.navButtons[2].disabled = !reviewing;
    this.navButtons[3].disabled = !reviewing;
    this.renderResignButton();
    this.renderSoundButton();
  }

  private renderStrip(strip: HTMLElement, who: "engine" | "player", color: "w" | "b"): void {
    const name = who === "engine" ? `Engine, ${LEVEL_NAMES[this.session.difficulty].toLowerCase()}` : "You";
    const thinking = who === "engine" && this.thinking;
    strip.replaceChildren();
    const badge = element("span", "strip-piece");
    badge.innerHTML = svgInstance(pieceSvg("k", color));
    const label = element("span", "strip-name", name);
    strip.append(badge, label);
    if (thinking) {
      const dots = element("span", "thinking");
      dots.setAttribute("aria-label", "Thinking");
      dots.append(element("i"), element("i"), element("i"));
      strip.append(dots);
    }
    const game = this.session.game;
    const toMove = game && game.status().result === "*" && (game.position.turn === WHITE ? "w" : "b") === color;
    strip.classList.toggle("to-move", Boolean(toMove));
  }

  private renderScoresheet(game: Game): void {
    const startPosition = Position.fromFen(game.startFen);
    const rows = scoresheetRows(
      game.moves.map((move) => move.san),
      startPosition.fullmoveNumber,
      startPosition.turn === WHITE ? "white" : "black",
    );
    const activePly = this.viewPly ?? game.moves.length;
    this.scoresheet.replaceChildren();
    for (const row of rows) {
      const item = element("li", "sheet-row");
      item.append(element("span", "sheet-number", `${row.number}.`));
      [row.white, row.black].forEach((cell, column) => {
        if (!cell) {
          // A leading "..." marks a game that started with black to move.
          item.append(element("span", "sheet-move empty", column === 0 ? "..." : ""));
          return;
        }
        const moveButton = button(cell.san, "sheet-move", () => this.navigate(cell.ply));
        if (cell.ply === activePly) moveButton.setAttribute("aria-current", "true");
        item.append(moveButton);
      });
      this.scoresheet.append(item);
    }
    const result = game.status().result;
    if (result !== "*") {
      const resultRow = element("li", "sheet-result", result === "1/2-1/2" ? "½–½" : result);
      this.scoresheet.append(resultRow);
    }
    if (rows.length === 0) this.scoresheet.append(element("li", "sheet-empty", "No moves yet."));
    const active = this.scoresheet.querySelector<HTMLElement>("[aria-current='true']");
    active?.scrollIntoView({ block: "nearest" });
  }

  private renderResignButton(): void {
    const game = this.session.game;
    const armed = Date.now() <= this.resignArmedUntil;
    this.resignButton.textContent = armed ? "Confirm resign" : "Resign";
    this.resignButton.classList.toggle("armed", armed);
    this.resignButton.disabled = !game || game.status().result !== "*";
  }

  private renderSoundButton(): void {
    this.soundButton.textContent = this.sound.enabled ? "Sound on" : "Sound off";
    this.soundButton.setAttribute("aria-pressed", String(this.sound.enabled));
  }
}
