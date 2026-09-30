/**
 * The controller: it owns the game, the engine client, the board view and every
 * panel around them. Both ways of importing a saved game (the button and the
 * save bridge) funnel through {@link App.adopt}, so they cannot drift apart.
 */

import { createBridge, type BridgeWindow } from "./bridge.ts";
import { isDifficulty, type Difficulty } from "./engine/difficulty.ts";
import { Game, type GameStatus, type MoveRecord, type Side } from "./engine/game.ts";
import {
  exportState,
  loadState,
  serializeState,
  suggestedFilename,
  summarise,
  type SavedGameState,
} from "./engine/gamestate.ts";
import {
  BISHOP,
  KNIGHT,
  Position,
  QUEEN,
  ROOK,
  START_FEN,
  WHITE,
  moveFrom,
  movePromotion,
  moveTo,
} from "./engine/position.ts";
import { EngineClient } from "./engine-client.ts";
import { BoardView } from "./ui/board.ts";
import { materialSummary } from "./ui/material.ts";
import { pairMoves } from "./ui/movelist.ts";
import { pieceSvg, type PieceKind } from "./ui/pieces.ts";
import { SoundBoard } from "./ui/sounds.ts";

const STORAGE_PREFIX = "opus_5-0_20260930:";
const PREFERENCES_KEY = `${STORAGE_PREFIX}preferences`;
const GAME_KEY = `${STORAGE_PREFIX}game`;
/** A reply that lands instantly feels broken, so hold the weakest levels back. */
const MINIMUM_THINK_MS = 280;
const TOAST_MS = 4200;

const DIFFICULTY_HINTS: Record<Difficulty, string> = {
  easy: "Looks two moves ahead and does not check recaptures, so it leaves pieces hanging.",
  medium: "Searches four moves deep with a little noise in its choices. A fair club opponent.",
  hard: "Searches seven moves deep with the full evaluation and no randomness.",
  expert: "Thinks for about three seconds and searches as deep as that allows.",
};

const KIND_BY_TYPE: readonly PieceKind[] = ["p", "p", "n", "b", "r", "q", "k"];
const PROMOTION_CHOICES = [QUEEN, ROOK, BISHOP, KNIGHT];

interface Preferences {
  difficulty: Difficulty;
  playerColor: Side;
  sound: boolean;
}

type TransferMode = "import" | "export";

/** Ids all come from index.html, so the caller names the element type it wrote. */
function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing element #${id}`);
  return found as T;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class App {
  private game: Game | null = null;
  private playerColor: Side = "white";
  private difficulty: Difficulty = "medium";
  private orientation: Side = "white";
  private viewIndex = 0;
  private thinking = false;
  /** Bumped whenever the game is replaced, so stale engine replies are dropped. */
  private generation = 0;
  private pendingPromotion: { from: number; to: number } | null = null;
  private engineDetail = "";
  private setupColour: Side | "random" = "white";
  private setupDifficulty: Difficulty = "medium";
  private toastTimer = 0;

  private readonly engine = new EngineClient();
  private readonly sounds = new SoundBoard();
  private readonly board: BoardView;

  private readonly els = {
    board: element("board"),
    statusBox: element("status"),
    statusLine: element("status-line"),
    statusDetail: element("status-detail"),
    moves: element("moves"),
    setup: element("setup"),
    setupForm: element<HTMLFormElement>("setup-form"),
    setupResume: element<HTMLButtonElement>("setup-resume"),
    setupCancel: element<HTMLButtonElement>("setup-cancel"),
    setupImport: element<HTMLButtonElement>("setup-import"),
    difficultyHint: element("difficulty-hint"),
    promotion: element("promotion"),
    promoRow: element("promo-row"),
    promoCancel: element<HTMLButtonElement>("promo-cancel"),
    transfer: element("transfer"),
    transferTitle: element("transfer-title"),
    transferHint: element("transfer-hint"),
    transferText: element<HTMLTextAreaElement>("transfer-text"),
    transferActions: element("transfer-actions"),
    toast: element("toast"),
    brandSub: element("brand-sub"),
    btnNew: element<HTMLButtonElement>("btn-new"),
    btnUndo: element<HTMLButtonElement>("btn-undo"),
    btnFlip: element<HTMLButtonElement>("btn-flip"),
    btnResign: element<HTMLButtonElement>("btn-resign"),
    btnExport: element<HTMLButtonElement>("btn-export"),
    btnImport: element<HTMLButtonElement>("btn-import"),
    btnSound: element<HTMLButtonElement>("btn-sound"),
    navStart: element<HTMLButtonElement>("nav-start"),
    navPrev: element<HTMLButtonElement>("nav-prev"),
    navNext: element<HTMLButtonElement>("nav-next"),
    navEnd: element<HTMLButtonElement>("nav-end"),
  };

  constructor() {
    this.board = new BoardView(this.els.board, {
      targetsFrom: (square) => this.targetsFrom(square),
      requestMove: (from, to) => this.requestMove(from, to),
      interactive: () => this.interactive(),
    });
    this.restorePreferences();
    this.wireControls();
    this.openSetup(false);
    this.render();
    this.startBridge();
  }

  /* ------------------------------------------------------------ bridge --- */

  private startBridge(): void {
    // The real window satisfies the bridge's narrow structural contract, but its
    // overloaded addEventListener signature does not assign to it directly.
    const host = window as unknown as BridgeWindow;
    createBridge(
      {
        getState: () =>
          this.game
            ? {
                state: exportState(this.game, this.playerColor, this.difficulty),
                summary: summarise(this.game),
              }
            : { state: null, summary: null },
        loadState: (state) => {
          this.adopt(loadState(state));
        },
      },
      host,
    ).start();
  }

  /* ------------------------------------------------------- preferences --- */

  private restorePreferences(): void {
    const stored = this.readStorage<Partial<Preferences>>(PREFERENCES_KEY);
    if (stored) {
      if (isDifficulty(stored.difficulty)) this.difficulty = stored.difficulty;
      if (stored.playerColor === "white" || stored.playerColor === "black") {
        this.playerColor = stored.playerColor;
      }
      if (typeof stored.sound === "boolean") this.sounds.enabled = stored.sound;
    }
    this.setupColour = this.playerColor;
    this.setupDifficulty = this.difficulty;
    this.orientation = this.playerColor;
    this.board.setOrientation(this.orientation);
    this.updateSoundButton();
  }

  private savePreferences(): void {
    this.writeStorage(PREFERENCES_KEY, {
      difficulty: this.difficulty,
      playerColor: this.playerColor,
      sound: this.sounds.enabled,
    } satisfies Preferences);
  }

  private saveGame(): void {
    if (!this.game) return;
    this.writeStorage(GAME_KEY, exportState(this.game, this.playerColor, this.difficulty));
  }

  /**
   * Stored JSON is shaped but not trusted: preferences are checked field by
   * field below and a stored game goes through the same importer as any other.
   */
  private readStorage<T>(key: string): T | null {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private writeStorage(key: string, value: unknown): void {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private browsing and full quotas are not worth interrupting a game for */
    }
  }

  /* ------------------------------------------------------------ wiring --- */

  private wireControls(): void {
    this.els.btnNew.addEventListener("click", () => this.openSetup(true));
    this.els.btnUndo.addEventListener("click", () => void this.takeBack());
    this.els.btnFlip.addEventListener("click", () => {
      this.orientation = this.orientation === "white" ? "black" : "white";
      this.board.setOrientation(this.orientation);
      this.render();
    });
    this.els.btnResign.addEventListener("click", () => this.resign());
    this.els.btnExport.addEventListener("click", () => this.openTransfer("export"));
    this.els.btnImport.addEventListener("click", () => this.openTransfer("import"));
    this.els.setupImport.addEventListener("click", () => this.openTransfer("import"));
    this.els.btnSound.addEventListener("click", () => {
      this.sounds.enabled = !this.sounds.enabled;
      this.updateSoundButton();
      this.savePreferences();
      if (this.sounds.enabled) this.sounds.play("move");
    });

    this.els.navStart.addEventListener("click", () => this.setViewIndex(0));
    this.els.navPrev.addEventListener("click", () => this.setViewIndex(this.viewIndex - 1));
    this.els.navNext.addEventListener("click", () => this.setViewIndex(this.viewIndex + 1));
    this.els.navEnd.addEventListener("click", () =>
      this.setViewIndex(this.game ? this.game.moves.length : 0),
    );

    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-colour]")) {
      button.addEventListener("click", () => {
        const value = button.dataset.colour;
        this.setupColour = value === "black" ? "black" : value === "random" ? "random" : "white";
        this.paintSetupChoices();
      });
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-difficulty]")) {
      button.addEventListener("click", () => {
        if (isDifficulty(button.dataset.difficulty)) this.setupDifficulty = button.dataset.difficulty;
        this.paintSetupChoices();
      });
    }
    this.els.setupForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.startGame();
    });
    this.els.setupCancel.addEventListener("click", () => {
      this.els.setup.hidden = true;
    });
    this.els.setupResume.addEventListener("click", () => this.resumeStoredGame());
    this.els.promoCancel.addEventListener("click", () => this.closePromotion());

    document.addEventListener("keydown", (event) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === "ArrowLeft") this.setViewIndex(this.viewIndex - 1);
      else if (event.key === "ArrowRight") this.setViewIndex(this.viewIndex + 1);
      else if (event.key === "Escape") {
        this.closePromotion();
        this.els.transfer.hidden = true;
      } else return;
      event.preventDefault();
    });
  }

  private updateSoundButton(): void {
    this.els.btnSound.textContent = this.sounds.enabled ? "Sound on" : "Sound off";
    this.els.btnSound.setAttribute("aria-pressed", String(this.sounds.enabled));
  }

  /* ------------------------------------------------------------- setup --- */

  private openSetup(cancellable: boolean): void {
    this.setupColour = this.playerColor;
    this.setupDifficulty = this.difficulty;
    this.paintSetupChoices();
    const stored = this.readStorage<SavedGameState>(GAME_KEY);
    this.els.setupResume.hidden = !stored || stored.moves === undefined;
    this.els.setupCancel.hidden = !cancellable;
    this.els.setup.hidden = false;
  }

  private paintSetupChoices(): void {
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-colour]")) {
      button.setAttribute("aria-pressed", String(button.dataset.colour === this.setupColour));
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-difficulty]")) {
      button.setAttribute("aria-pressed", String(button.dataset.difficulty === this.setupDifficulty));
    }
    this.els.difficultyHint.textContent = DIFFICULTY_HINTS[this.setupDifficulty];
  }

  private async startGame(): Promise<void> {
    const colour: Side =
      this.setupColour === "random"
        ? Math.random() < 0.5
          ? "white"
          : "black"
        : this.setupColour;
    this.generation++;
    this.playerColor = colour;
    this.difficulty = this.setupDifficulty;
    this.game = new Game(START_FEN);
    this.orientation = colour;
    this.board.setOrientation(colour);
    this.board.clearSelection();
    this.viewIndex = 0;
    this.thinking = false;
    this.engineDetail = "";
    this.els.setup.hidden = true;
    this.savePreferences();
    this.saveGame();
    this.render();
    await this.scheduleEngineMove();
  }

  private resumeStoredGame(): void {
    const stored = this.readStorage<SavedGameState>(GAME_KEY);
    if (!stored) return;
    try {
      this.adopt(loadState(stored));
    } catch (error) {
      this.toast(`Could not resume: ${messageOf(error)}`, true);
    }
  }

  /* ---------------------------------------------------------- game flow --- */

  private adopt(loaded: { game: Game; playerColor: Side; difficulty: Difficulty }): void {
    this.generation++;
    this.game = loaded.game;
    this.playerColor = loaded.playerColor;
    this.difficulty = loaded.difficulty;
    this.orientation = loaded.playerColor;
    this.board.setOrientation(this.orientation);
    this.board.clearSelection();
    this.viewIndex = loaded.game.moves.length;
    this.thinking = false;
    this.pendingPromotion = null;
    this.engineDetail = "";
    this.els.setup.hidden = true;
    this.els.transfer.hidden = true;
    this.els.promotion.hidden = true;
    this.savePreferences();
    this.saveGame();
    this.render();
    void this.scheduleEngineMove();
  }

  private interactive(): boolean {
    if (!this.game || this.thinking || this.pendingPromotion) return false;
    if (this.viewIndex !== this.game.moves.length) return false;
    if (this.game.status().over) return false;
    return this.game.sideToMove() === this.playerColor;
  }

  private targetsFrom(square: number): number[] {
    if (!this.game || !this.interactive()) return [];
    const seen = new Set<number>();
    for (const move of this.game.position.legalMoves()) {
      if (moveFrom(move) === square) seen.add(moveTo(move));
    }
    return [...seen];
  }

  private requestMove(from: number, to: number): void {
    if (!this.game || !this.interactive()) return;
    const candidates = this.game.position
      .legalMoves()
      .filter((move) => moveFrom(move) === from && moveTo(move) === to);
    if (candidates.length === 0) {
      this.sounds.play("illegal");
      return;
    }
    if (candidates.some((move) => movePromotion(move) !== 0)) {
      this.openPromotion(from, to);
      return;
    }
    this.applyMove(candidates[0]);
    void this.scheduleEngineMove();
  }

  private openPromotion(from: number, to: number): void {
    if (!this.game) return;
    this.pendingPromotion = { from, to };
    const colour = this.game.position.turn === WHITE ? "w" : "b";
    this.els.promoRow.innerHTML = "";
    for (const type of PROMOTION_CHOICES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "promo-choice";
      button.title = `Promote to ${KIND_BY_TYPE[type]}`;
      button.innerHTML = pieceSvg(KIND_BY_TYPE[type], colour);
      button.addEventListener("click", () => this.completePromotion(type));
      this.els.promoRow.append(button);
    }
    this.els.promotion.hidden = false;
    this.render();
  }

  private completePromotion(type: number): void {
    const pending = this.pendingPromotion;
    if (!this.game || !pending) return;
    const move = this.game.position
      .legalMoves()
      .find(
        (candidate) =>
          moveFrom(candidate) === pending.from &&
          moveTo(candidate) === pending.to &&
          movePromotion(candidate) === type,
      );
    this.closePromotion();
    if (move === undefined) return;
    this.applyMove(move);
    void this.scheduleEngineMove();
  }

  private closePromotion(): void {
    this.pendingPromotion = null;
    this.els.promotion.hidden = true;
    this.board.clearSelection();
    this.render();
  }

  private applyMove(move: number): void {
    if (!this.game) return;
    const record = this.game.playMove(move);
    this.viewIndex = this.game.moves.length;
    this.board.clearSelection();
    this.sounds.play(soundFor(record));
    this.render();
    this.saveGame();
    const status = this.game.status();
    if (status.over) this.sounds.play("end");
  }

  private async scheduleEngineMove(): Promise<void> {
    const game = this.game;
    if (!game) return;
    if (game.status().over || game.sideToMove() === this.playerColor) return;

    const generation = this.generation;
    this.thinking = true;
    this.render();
    try {
      const [response] = await Promise.all([
        this.engine.think(game.startFen, game.uciMoves(), this.difficulty),
        delay(MINIMUM_THINK_MS),
      ]);
      if (generation !== this.generation || this.game !== game) return;
      this.thinking = false;
      if (!response.uci) {
        this.render();
        return;
      }
      const move = game.findMoveByUci(response.uci);
      if (move === null) throw new Error(`the engine suggested ${response.uci}, which is not legal`);
      this.engineDetail = describeSearch(response.depth, response.score, response.nodes);
      this.applyMove(move);
    } catch (error) {
      if (generation !== this.generation) return;
      this.thinking = false;
      this.toast(`Engine problem: ${messageOf(error)}`, true);
      this.render();
    }
  }

  private async takeBack(): Promise<void> {
    if (!this.game || this.thinking || this.game.moves.length === 0) return;
    this.generation++;
    this.game.undo();
    while (this.game.moves.length > 0 && this.game.sideToMove() !== this.playerColor) {
      this.game.undo();
    }
    this.viewIndex = this.game.moves.length;
    this.board.clearSelection();
    this.engineDetail = "";
    this.render();
    this.saveGame();
    await this.scheduleEngineMove();
  }

  private resign(): void {
    if (!this.game || this.game.status().over) return;
    this.generation++;
    this.thinking = false;
    this.game.resign(this.playerColor);
    this.sounds.play("end");
    this.render();
    this.saveGame();
  }

  private setViewIndex(index: number): void {
    if (!this.game) return;
    const clamped = Math.max(0, Math.min(index, this.game.moves.length));
    if (clamped === this.viewIndex) return;
    this.viewIndex = clamped;
    this.board.clearSelection();
    this.render();
  }

  /* --------------------------------------------------------- transfer ---- */

  private openTransfer(mode: TransferMode): void {
    this.els.transferActions.innerHTML = "";
    if (mode === "export") {
      if (!this.game) {
        this.toast("Start a game before exporting one.", true);
        return;
      }
      const state = exportState(this.game, this.playerColor, this.difficulty);
      const text = serializeState(state);
      this.els.transferTitle.textContent = "Export game";
      this.els.transferHint.textContent =
        "This is the portable save state. Download it, or copy it and paste it into any other game on the site.";
      this.els.transferText.value = text;
      this.els.transferText.readOnly = true;
      this.addTransferButton("Download .json", true, () => this.download(state, text));
      this.addTransferButton("Copy", false, () => void this.copy(text));
      this.addTransferButton("Close", false, () => {
        this.els.transfer.hidden = true;
      });
    } else {
      this.els.transferTitle.textContent = "Import game";
      this.els.transferHint.textContent =
        "Paste a saved state, or choose a .json file. Every move is replayed through the rules before anything changes.";
      this.els.transferText.value = "";
      this.els.transferText.readOnly = false;
      this.addTransferButton("Import", true, () => this.importText(this.els.transferText.value));
      this.addTransferButton("Choose file…", false, () => this.pickFile());
      this.addTransferButton("Cancel", false, () => {
        this.els.transfer.hidden = true;
      });
    }
    this.els.transfer.hidden = false;
    if (mode === "import") this.els.transferText.focus();
  }

  private addTransferButton(label: string, primary: boolean, onClick: () => void): void {
    const button = document.createElement("button");
    button.type = "button";
    button.className = primary ? "btn btn-primary" : "btn";
    button.textContent = label;
    button.addEventListener("click", onClick);
    this.els.transferActions.append(button);
  }

  private download(state: SavedGameState, text: string): void {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = suggestedFilename(state);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    this.toast("Saved game downloaded.");
  }

  private async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast("Saved game copied to the clipboard.");
    } catch {
      this.els.transferText.select();
      this.toast("Copying was blocked. The text is selected, so press copy.", true);
    }
  }

  private pickFile(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json,text/plain";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      void file.text().then(
        (text) => {
          this.els.transferText.value = text;
          this.importText(text);
        },
        () => this.toast("That file could not be read.", true),
      );
    });
    input.click();
  }

  /** The interface path into the shared importer. Leaves the game alone on error. */
  private importText(text: string): void {
    if (!text.trim()) {
      this.toast("Paste a saved game first.", true);
      return;
    }
    try {
      this.adopt(loadState(text));
      this.toast("Saved game loaded.");
    } catch (error) {
      this.toast(`Import failed: ${messageOf(error)}`, true);
    }
  }

  private toast(message: string, isError = false): void {
    this.els.toast.textContent = message;
    this.els.toast.classList.toggle("error", isError);
    this.els.toast.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.els.toast.hidden = true;
    }, TOAST_MS);
  }

  /* ------------------------------------------------------------ render --- */

  private viewedPosition(): Position {
    if (!this.game) return Position.fromFen(START_FEN);
    if (this.viewIndex >= this.game.moves.length) return this.game.position;
    if (this.viewIndex === 0) return Position.fromFen(this.game.startFen);
    return Position.fromFen(this.game.moves[this.viewIndex - 1].fenAfter);
  }

  private render(): void {
    const position = this.viewedPosition();
    const previous = this.game && this.viewIndex > 0 ? this.game.moves[this.viewIndex - 1] : null;
    this.board.render(position, {
      lastMove: previous ? { from: moveFrom(previous.move), to: moveTo(previous.move) } : null,
      checkSquare: position.isCheck() ? position.kingSquare[position.turn] : null,
    });
    this.renderStatus();
    this.renderMoves();
    this.renderPlayers(position);
    this.renderControls();
    this.els.brandSub.textContent = this.game
      ? `${this.difficulty} · you are ${this.playerColor}`
      : "Self-written engine";
  }

  private renderStatus(): void {
    const { statusLine, statusDetail, statusBox } = this.els;
    statusBox.classList.toggle("thinking", this.thinking);
    if (!this.game) {
      statusLine.textContent = "No game yet";
      statusDetail.textContent = "Pick a colour and a strength to begin.";
      return;
    }
    const status = this.game.status();
    if (status.over) {
      statusLine.textContent = this.describeResult(status);
      statusDetail.textContent = `${this.game.moves.length} half-moves · ${status.result}`;
      return;
    }
    if (this.thinking) {
      statusLine.textContent = "Opus is thinking";
      statusDetail.textContent = `${this.difficulty} · searching`;
      return;
    }
    if (this.viewIndex !== this.game.moves.length) {
      statusLine.textContent = `Reviewing move ${this.viewIndex} of ${this.game.moves.length}`;
      statusDetail.textContent = "Press the last arrow to return to the game.";
      return;
    }
    const yourMove = this.game.sideToMove() === this.playerColor;
    const check = this.game.position.isCheck();
    statusLine.textContent = yourMove
      ? check
        ? "Your move, you are in check"
        : "Your move"
      : check
        ? "Opus is in check"
        : "Opus to move";
    statusDetail.textContent = this.engineDetail || `${this.difficulty} · ${this.game.moves.length} half-moves`;
  }

  private describeResult(status: GameStatus): string {
    if (status.result === "1/2-1/2") return `Draw: ${status.reason}`;
    const winner: Side = status.result === "1-0" ? "white" : "black";
    const youWon = winner === this.playerColor;
    const headline = status.reason === "resignation" ? "Resignation" : capitalise(status.reason);
    return `${headline}: ${youWon ? "you win" : "Opus wins"}`;
  }

  private renderMoves(): void {
    const container = this.els.moves;
    container.innerHTML = "";
    if (!this.game || this.game.moves.length === 0) {
      const empty = document.createElement("p");
      empty.className = "move-empty";
      empty.textContent = this.game ? "No moves yet." : "Start a game to see the move list.";
      container.append(empty);
      return;
    }
    for (const row of pairMoves(this.game)) {
      const line = document.createElement("div");
      line.className = "move-row";
      const number = document.createElement("span");
      number.className = "move-no";
      number.textContent = `${row.number}.`;
      line.append(number);
      for (const cell of [row.white, row.black]) {
        if (!cell) {
          const blank = document.createElement("span");
          blank.className = "move-cell";
          blank.textContent = row.white ? "" : "…";
          line.append(blank);
          continue;
        }
        const button = document.createElement("button");
        button.type = "button";
        button.className = "move-cell";
        button.textContent = cell.san;
        if (cell.index + 1 === this.viewIndex) button.classList.add("current");
        button.addEventListener("click", () => this.setViewIndex(cell.index + 1));
        line.append(button);
      }
      container.append(line);
    }
    // scrollIntoView would scroll the whole stacked layout on a narrow screen,
    // so nudge this container's own scroll position instead.
    const current = container.querySelector<HTMLElement>(".move-cell.current");
    if (current) {
      const centred = current.offsetTop - container.clientHeight / 2 + current.offsetHeight / 2;
      container.scrollTop = Math.max(0, centred);
    }
  }

  private renderPlayers(position: Position): void {
    const start = Position.fromFen(this.game ? this.game.startFen : START_FEN);
    const summary = materialSummary(start, position);
    const strips = document.querySelectorAll<HTMLElement>(".player-strip");
    for (const strip of strips) {
      const atBottom = strip.dataset.role === "bottom";
      const colour: Side = atBottom ? this.orientation : this.orientation === "white" ? "black" : "white";
      const isPlayer = this.game !== null && colour === this.playerColor;
      const name = strip.querySelector<HTMLElement>(".player-name");
      const material = strip.querySelector<HTMLElement>(".player-material");
      const captures = strip.querySelector<HTMLElement>(".player-captures");
      if (!name || !material || !captures) continue;

      name.textContent = this.game
        ? isPlayer
          ? `You (${colour})`
          : `Opus (${colour})`
        : capitalise(colour);
      name.classList.toggle(
        "to-move",
        this.game !== null &&
          !this.game.status().over &&
          (position.turn === WHITE ? "white" : "black") === colour,
      );

      const taken = colour === "white" ? summary.takenByWhite : summary.takenByBlack;
      const opponentColour = colour === "white" ? "b" : "w";
      captures.innerHTML = taken.map((type) => pieceSvg(KIND_BY_TYPE[type], opponentColour)).join("");
      const edge = colour === "white" ? summary.advantage : -summary.advantage;
      material.textContent = edge > 0 ? `+${edge}` : "";
    }
  }

  private renderControls(): void {
    const game = this.game;
    const over = Boolean(game?.status().over);
    const moves = game?.moves.length ?? 0;
    this.els.btnUndo.disabled = !game || this.thinking || moves === 0;
    this.els.btnResign.disabled = !game || this.thinking || over;
    this.els.btnExport.disabled = !game;
    this.els.navStart.disabled = !game || this.viewIndex === 0;
    this.els.navPrev.disabled = !game || this.viewIndex === 0;
    this.els.navNext.disabled = !game || this.viewIndex >= moves;
    this.els.navEnd.disabled = !game || this.viewIndex >= moves;
  }
}

function soundFor(record: MoveRecord): "move" | "capture" | "castle" | "check" | "promote" {
  if (record.san.includes("#")) return "check";
  if (record.san.startsWith("O-O")) return "castle";
  if (record.san.includes("=")) return "promote";
  if (record.san.includes("+")) return "check";
  if (record.san.includes("x")) return "capture";
  return "move";
}

function describeSearch(depth: number, score: number, nodes: number): string {
  const pawns = (score / 100).toFixed(2);
  const signed = score > 0 ? `+${pawns}` : pawns;
  const shown = nodes >= 1000 ? `${Math.round(nodes / 1000)}k` : String(nodes);
  return `depth ${depth} · ${signed} · ${shown} nodes`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
