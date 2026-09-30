import { sq0x88 } from "../engine/board.ts";
import {
  BISHOP,
  BLACK,
  Color,
  EMPTY,
  KNIGHT,
  Move,
  pieceColor,
  pieceType,
  PieceType,
  QUEEN,
  ROOK,
  WHITE,
} from "../engine/types.ts";
import { createBridge } from "../game/bridge.ts";
import { Game } from "../game/game.ts";
import { exportStateJson, tryLoadState } from "../game/state.ts";
import { Difficulty, DIFFICULTIES, GameState, PlayerColor } from "../game/types.ts";
import { EngineClient } from "./engine-client.ts";
import { pieceSvg } from "./pieces.ts";

const STORAGE_PREFIX = "opus_4-8_20260930";
const KEY_AUTOSAVE = `${STORAGE_PREFIX}:autosave`;
const KEY_SETTINGS = `${STORAGE_PREFIX}:settings`;

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  expert: "Expert",
};

const RESULT_TEXT: Record<string, string> = {
  "1-0": "White wins",
  "0-1": "Black wins",
  "1/2-1/2": "Draw",
};

const REASON_TEXT: Record<string, string> = {
  checkmate: "Checkmate",
  stalemate: "Stalemate",
  "fifty-move": "Fifty-move rule",
  threefold: "Threefold repetition",
  insufficient: "Insufficient material",
  resignation: "Resignation",
};

/** Read a small JSON blob from localStorage, tolerating unavailability. */
function readStore<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStore(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be unavailable (private mode); ignore */
  }
}

function removeStore(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** The whole client: setup screen, board, move list, dialogs, engine, bridge. */
export class ChessApp {
  private readonly root: HTMLElement;
  private readonly engine = new EngineClient();

  private game: Game | null = null;
  private viewPly = 0;
  private selected: number | null = null;
  private thinking = false;
  /** Bumped whenever the active game is replaced, to void stale engine replies. */
  private token = 0;

  private setupColor: PlayerColor = "white";
  private setupDifficulty: Difficulty = "medium";

  constructor(root: HTMLElement) {
    this.root = root;
    const settings = readStore<{ color: PlayerColor; difficulty: Difficulty }>(KEY_SETTINGS);
    if (settings) {
      this.setupColor = settings.color === "black" ? "black" : "white";
      if (DIFFICULTIES.includes(settings.difficulty)) this.setupDifficulty = settings.difficulty;
    }

    createBridge({
      getSnapshot: () => this.snapshotForBridge(),
      loadState: (input) => this.loadFromBridge(input),
    });

    this.renderShell();
    this.resumeOrSetup();
  }

  // ---------- Bridge ----------

  private snapshotForBridge(): {
    state: GameState | null;
    summary: { result: "1-0" | "0-1" | "1/2-1/2" | "*"; moveCount: number } | null;
  } {
    if (!this.game) return { state: null, summary: null };
    return {
      state: this.game.toState(),
      summary: { result: this.game.status().result, moveCount: this.game.moveCount },
    };
  }

  private loadFromBridge(input: unknown): { ok: boolean; error?: string } {
    const outcome = tryLoadState(input);
    if (!outcome.ok) return { ok: false, error: outcome.error };
    this.adoptGame(outcome.game);
    return { ok: true };
  }

  // ---------- Persistence / lifecycle ----------

  private resumeOrSetup(): void {
    const saved = readStore<GameState>(KEY_AUTOSAVE);
    if (saved) {
      const outcome = tryLoadState(saved);
      if (outcome.ok && (outcome.game.moveCount > 0 || outcome.game.isOver())) {
        this.adoptGame(outcome.game);
        return;
      }
    }
    this.renderSetup();
  }

  private adoptGame(game: Game): void {
    this.token++;
    this.engine.cancel();
    this.game = game;
    this.selected = null;
    this.thinking = false;
    this.viewPly = game.moveCount;
    this.autosave();
    this.renderGame();
    this.maybeEngineMove();
  }

  private startGame(color: PlayerColor, difficulty: Difficulty): void {
    writeStore(KEY_SETTINGS, { color, difficulty });
    this.adoptGame(new Game(color, difficulty));
  }

  private newGame(): void {
    this.token++;
    this.engine.cancel();
    this.game = null;
    this.selected = null;
    this.thinking = false;
    removeStore(KEY_AUTOSAVE);
    this.renderSetup();
  }

  private autosave(): void {
    if (this.game) writeStore(KEY_AUTOSAVE, this.game.toState());
  }

  private humanColor(): Color {
    return this.game && this.game.playerColor === "black" ? BLACK : WHITE;
  }

  private isLive(): boolean {
    return !!this.game && this.viewPly === this.game.moveCount;
  }

  private isHumanTurn(): boolean {
    return (
      !!this.game &&
      !this.game.isOver() &&
      !this.thinking &&
      this.isLive() &&
      this.game.turn === this.humanColor()
    );
  }

  // ---------- Engine ----------

  private maybeEngineMove(): void {
    if (!this.game || this.game.isOver()) return;
    if (this.game.turn === this.humanColor()) return;
    this.thinking = true;
    this.renderGame();

    const token = this.token;
    const fen = this.game.currentFen();
    this.engine
      .search(fen, this.game.difficulty)
      .then((res) => {
        if (token !== this.token || !this.game) return; // superseded
        this.thinking = false;
        if (res.uci && this.game.applyUci(res.uci)) {
          this.viewPly = this.game.moveCount;
          this.autosave();
          this.renderGame();
          this.maybeEngineMove();
        } else {
          this.renderGame();
        }
      })
      .catch(() => {
        if (token === this.token) {
          this.thinking = false;
          this.renderGame();
        }
      });
  }

  // ---------- Move handling ----------

  private onSquareClick(sq: number): void {
    if (!this.game) return;
    if (!this.isLive()) {
      this.jumpToLive();
      return;
    }
    if (!this.isHumanTurn()) return;

    const board = this.game.boardAt(this.viewPly);
    const piece = board.squares[sq];

    if (this.selected === null) {
      if (piece !== EMPTY && pieceColor(piece) === this.humanColor()) {
        this.selected = sq;
        this.renderBoard();
      }
      return;
    }

    if (sq === this.selected) {
      this.selected = null;
      this.renderBoard();
      return;
    }

    // Re-select another of the player's own pieces.
    if (piece !== EMPTY && pieceColor(piece) === this.humanColor()) {
      this.selected = sq;
      this.renderBoard();
      return;
    }

    this.attemptMove(this.selected, sq);
  }

  private attemptMove(from: number, to: number): void {
    if (!this.game) return;
    const candidates = this.game.legalMovesFrom(from).filter((m) => m.to === to);
    if (candidates.length === 0) {
      this.selected = null;
      this.renderBoard();
      return;
    }
    if (candidates.length > 1 && candidates.every((m) => m.promotion)) {
      this.openPromotion(candidates);
      return;
    }
    this.commitMove(candidates[0]);
  }

  private commitMove(move: Move): void {
    if (!this.game) return;
    this.game.applyMove(move);
    this.selected = null;
    this.viewPly = this.game.moveCount;
    this.autosave();
    this.renderGame();
    this.maybeEngineMove();
  }

  // ---------- Review navigation ----------

  private goto(ply: number): void {
    if (!this.game) return;
    this.viewPly = Math.max(0, Math.min(ply, this.game.moveCount));
    this.selected = null;
    this.renderGame();
  }

  private jumpToLive(): void {
    if (this.game) this.goto(this.game.moveCount);
  }

  // ---------- Rendering: shell ----------

  private renderShell(): void {
    this.root.innerHTML = `
      <header class="app-header">
        <div class="app-title"><span class="dot"></span> Opus Chess</div>
        <div class="sub">Self-written engine &middot; four levels</div>
      </header>
      <main class="app-main" id="main"></main>
    `;
  }

  private main(): HTMLElement {
    return this.root.querySelector("#main") as HTMLElement;
  }

  // ---------- Rendering: setup ----------

  private renderSetup(): void {
    const colorButton = (value: PlayerColor, label: string, swatch: string): string => `
      <button data-color="${value}" aria-pressed="${this.setupColor === value}">
        <span class="swatch" style="background:${swatch}"></span>${label}
      </button>`;

    const diffButton = (value: Difficulty): string => `
      <button data-diff="${value}" aria-pressed="${this.setupDifficulty === value}">
        ${DIFFICULTY_LABEL[value]}
      </button>`;

    this.main().innerHTML = `
      <section class="setup">
        <h2>New game</h2>
        <p class="lead">Play against a chess engine written from scratch for this game.</p>
        <div class="field">
          <label>Play as</label>
          <div class="segmented seg-2" id="color-seg">
            ${colorButton("white", "White", "#f2ecdf")}
            ${colorButton("black", "Black", "#26231f")}
          </div>
        </div>
        <div class="field">
          <label>Difficulty</label>
          <div class="segmented seg-4" id="diff-seg">
            ${DIFFICULTIES.map(diffButton).join("")}
          </div>
        </div>
        <button class="btn btn-primary" id="start-btn">Start game</button>
        <div class="btn-row" style="margin-top:12px;justify-content:center">
          <button class="btn" id="import-btn">Import a saved game</button>
        </div>
      </section>
    `;

    const main = this.main();
    main.querySelector("#color-seg")?.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("button[data-color]") as HTMLElement | null;
      if (!btn) return;
      this.setupColor = btn.dataset.color as PlayerColor;
      this.renderSetup();
    });
    main.querySelector("#diff-seg")?.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("button[data-diff]") as HTMLElement | null;
      if (!btn) return;
      this.setupDifficulty = btn.dataset.diff as Difficulty;
      this.renderSetup();
    });
    main.querySelector("#start-btn")?.addEventListener("click", () => {
      this.startGame(this.setupColor, this.setupDifficulty);
    });
    main.querySelector("#import-btn")?.addEventListener("click", () => this.openImport());
  }

  // ---------- Rendering: game ----------

  private renderGame(): void {
    if (!this.game) return;
    const humanColor = this.humanColor();
    const oppColor: Color = (humanColor ^ 1) as Color;

    this.main().innerHTML = `
      <div class="layout">
        <div class="board-col">
          ${this.playerTag(oppColor, true)}
          <div class="board-wrap"><div class="board" id="board"></div></div>
          ${this.playerTag(humanColor, false)}
          <div class="review-bar">
            <button class="btn" id="rev-first" title="Start">&#124;&#9664;</button>
            <button class="btn" id="rev-prev" title="Previous">&#9664;</button>
            <button class="btn" id="rev-next" title="Next">&#9654;</button>
            <button class="btn" id="rev-last" title="Live">&#9654;&#124;</button>
          </div>
          <div class="review-note" id="rev-note"></div>
        </div>
        <div class="panel">
          <div class="status" id="status"></div>
          <div class="moves">
            <h3>Moves</h3>
            <div class="movelist" id="movelist"></div>
          </div>
          <div class="btn-row">
            <button class="btn" id="btn-export">Export</button>
            <button class="btn" id="btn-import">Import</button>
            <button class="btn btn-danger" id="btn-resign">Resign</button>
            <button class="btn" id="btn-new">New game</button>
          </div>
        </div>
      </div>
    `;

    this.renderBoard();
    this.renderStatus();
    this.renderMoveList();
    this.renderReviewNote();
    this.wireGameControls();
  }

  private playerTag(color: Color, isOpponent: boolean): string {
    const chip = color === WHITE ? "white" : "black";
    const name = color === WHITE ? "White" : "Black";
    const you = color === this.humanColor() ? " (you)" : "";
    const diff = this.game ? DIFFICULTY_LABEL[this.game.difficulty] : "";
    const role = isOpponent ? `Engine &middot; ${diff}` : "You";
    const thinking = isOpponent && this.thinking ? `<span class="think">thinking&hellip;</span>` : "";
    return `
      <div class="player-tag ${isOpponent && this.thinking ? "thinking" : ""}">
        <span class="who"><span class="chip ${chip}"></span>${name}${you}</span>
        <span>${thinking || role}</span>
      </div>`;
  }

  private wireGameControls(): void {
    const main = this.main();
    const board = main.querySelector("#board") as HTMLElement;
    board.addEventListener("click", (e) => {
      const sqEl = (e.target as HTMLElement).closest(".square") as HTMLElement | null;
      if (!sqEl || sqEl.dataset.sq === undefined) return;
      this.onSquareClick(parseInt(sqEl.dataset.sq, 10));
    });

    main.querySelector("#rev-first")?.addEventListener("click", () => this.goto(0));
    main.querySelector("#rev-prev")?.addEventListener("click", () => this.goto(this.viewPly - 1));
    main.querySelector("#rev-next")?.addEventListener("click", () => this.goto(this.viewPly + 1));
    main.querySelector("#rev-last")?.addEventListener("click", () => this.jumpToLive());

    main.querySelector("#btn-export")?.addEventListener("click", () => this.openExport());
    main.querySelector("#btn-import")?.addEventListener("click", () => this.openImport());
    main.querySelector("#btn-resign")?.addEventListener("click", () => this.confirmResign());
    main.querySelector("#btn-new")?.addEventListener("click", () => this.newGame());
  }

  private renderBoard(): void {
    if (!this.game) return;
    const boardEl = this.main().querySelector("#board") as HTMLElement | null;
    if (!boardEl) return;

    const board = this.game.boardAt(this.viewPly);
    const humanColor = this.humanColor();
    const ranks = humanColor === WHITE ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
    const files = humanColor === WHITE ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];

    const lastMove = this.viewPly > 0 ? this.game.history[this.viewPly - 1].move : null;
    const checkSq = board.inCheck() ? board.kingSq[board.turn] : -1;
    const targets = this.selected !== null && this.isHumanTurn()
      ? new Set(this.game.legalMovesFrom(this.selected).map((m) => m.to))
      : new Set<number>();

    const bottomRank = ranks[ranks.length - 1];
    const leftFile = files[0];
    const parts: string[] = [];

    for (const rank of ranks) {
      for (const file of files) {
        const sq = sq0x88(file, rank);
        const isLight = (file + rank) % 2 === 1;
        const piece = board.squares[sq];
        const classes = ["square", isLight ? "light" : "dark"];
        if (sq === this.selected) classes.push("selected");
        if (lastMove && (sq === lastMove.from || sq === lastMove.to)) classes.push("lastmove");
        if (sq === checkSq) classes.push("check");

        let inner = "";
        if (piece !== EMPTY) inner += pieceSvg(pieceType(piece), pieceColor(piece));
        if (targets.has(sq)) {
          inner += `<span class="hint ${piece !== EMPTY ? "capture" : "move"}"></span>`;
        }
        if (rank === bottomRank) {
          inner += `<span class="coord file">${String.fromCharCode(97 + file)}</span>`;
        }
        if (file === leftFile) {
          inner += `<span class="coord rank">${rank + 1}</span>`;
        }
        parts.push(`<div class="${classes.join(" ")}" data-sq="${sq}">${inner}</div>`);
      }
    }
    boardEl.innerHTML = parts.join("");
  }

  private renderStatus(): void {
    if (!this.game) return;
    const el = this.main().querySelector("#status") as HTMLElement;
    const status = this.game.status();
    let headline: string;
    let detail: string;

    if (status.isOver) {
      headline = RESULT_TEXT[status.result] ?? "Game over";
      const reason = status.reason ? REASON_TEXT[status.reason] : "";
      detail = reason ? `by ${reason.toLowerCase()}` : "";
      el.classList.add("over");
    } else {
      const toMove = this.game.turn === WHITE ? "White" : "Black";
      const yours = this.game.turn === this.humanColor();
      headline = this.thinking ? "Engine is thinking" : `${toMove} to move`;
      detail = status.inCheck ? "Check!" : yours ? "Your move" : "";
      el.classList.remove("over");
    }
    el.innerHTML = `<div class="headline">${headline}</div><div class="detail">${detail}</div>`;
  }

  private renderMoveList(): void {
    if (!this.game) return;
    const el = this.main().querySelector("#movelist") as HTMLElement;
    const history = this.game.history;
    if (history.length === 0) {
      el.innerHTML = `<div class="empty">No moves yet.</div>`;
      return;
    }
    const rows: string[] = [];
    for (let i = 0; i < history.length; i += 2) {
      const moveNo = i / 2 + 1;
      rows.push(`<div class="num">${moveNo}.</div>`);
      rows.push(this.sanCell(history[i].san, i + 1));
      if (i + 1 < history.length) rows.push(this.sanCell(history[i + 1].san, i + 2));
      else rows.push(`<div></div>`);
    }
    el.innerHTML = rows.join("");

    el.querySelectorAll<HTMLElement>(".san[data-ply]").forEach((cell) => {
      cell.addEventListener("click", () => this.goto(parseInt(cell.dataset.ply as string, 10)));
    });
    const current = el.querySelector(".san.current");
    current?.scrollIntoView({ block: "nearest" });
  }

  private sanCell(san: string, ply: number): string {
    const cls = ply === this.viewPly ? "san current" : "san";
    return `<div class="${cls}" data-ply="${ply}">${san}</div>`;
  }

  private renderReviewNote(): void {
    if (!this.game) return;
    const el = this.main().querySelector("#rev-note") as HTMLElement;
    el.textContent = this.isLive()
      ? ""
      : `Reviewing move ${this.viewPly} of ${this.game.moveCount} — tap the board to return to live`;
  }

  // ---------- Dialogs ----------

  private openPromotion(candidates: Move[]): void {
    const color = this.humanColor();
    const types: PieceType[] = [QUEEN, ROOK, BISHOP, KNIGHT];
    const buttons = types
      .map(
        (t) => `<button data-type="${t}" aria-label="Promote to ${t}">${pieceSvg(t, color)}</button>`,
      )
      .join("");
    const overlay = this.overlay(`
      <div class="dialog">
        <h3>Promote to</h3>
        <div class="promo-grid">${buttons}</div>
      </div>
    `);
    overlay.querySelectorAll<HTMLElement>("button[data-type]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const type = parseInt(btn.dataset.type as string, 10) as PieceType;
        const move = candidates.find((m) => m.promotion === type);
        overlay.remove();
        if (move) this.commitMove(move);
      });
    });
  }

  private openExport(): void {
    if (!this.game) return;
    const json = exportStateJson(this.game);
    const overlay = this.overlay(`
      <div class="dialog">
        <h3>Export game</h3>
        <p class="hint-text">Download or copy this game state. It can be re-imported here or in any other Claude chess game.</p>
        <textarea readonly id="export-text">${escapeHtml(json)}</textarea>
        <div class="dialog-actions">
          <button class="btn" id="export-copy">Copy</button>
          <button class="btn" id="export-download">Download .json</button>
          <button class="btn btn-primary" style="width:auto" id="export-close">Close</button>
        </div>
      </div>
    `);
    overlay.querySelector("#export-close")?.addEventListener("click", () => overlay.remove());
    overlay.querySelector("#export-copy")?.addEventListener("click", () => {
      void this.copyText(json);
    });
    overlay.querySelector("#export-download")?.addEventListener("click", () => {
      this.download(`chess-${Date.now()}.json`, json);
    });
  }

  private openImport(): void {
    const overlay = this.overlay(`
      <div class="dialog">
        <h3>Import game</h3>
        <p class="hint-text">Paste an exported game state or choose a .json file, then load it.</p>
        <input type="file" accept="application/json,.json" id="import-file" />
        <textarea id="import-text" placeholder='{ "version": 1, ... }'></textarea>
        <p class="dialog-error" id="import-error"></p>
        <div class="dialog-actions">
          <button class="btn" id="import-cancel">Cancel</button>
          <button class="btn btn-primary" style="width:auto" id="import-load">Load game</button>
        </div>
      </div>
    `);
    const textarea = overlay.querySelector("#import-text") as HTMLTextAreaElement;
    const errorEl = overlay.querySelector("#import-error") as HTMLElement;

    overlay.querySelector("#import-file")?.addEventListener("change", (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      file.text().then((text) => {
        textarea.value = text;
      });
    });
    overlay.querySelector("#import-cancel")?.addEventListener("click", () => overlay.remove());
    overlay.querySelector("#import-load")?.addEventListener("click", () => {
      const outcome = tryLoadState(textarea.value.trim());
      if (!outcome.ok) {
        errorEl.textContent = outcome.error;
        return;
      }
      overlay.remove();
      this.adoptGame(outcome.game);
      this.toast("Game imported");
    });
  }

  private confirmResign(): void {
    if (!this.game || this.game.isOver()) return;
    const overlay = this.overlay(`
      <div class="dialog">
        <h3>Resign this game?</h3>
        <p class="hint-text">The engine will be awarded the win. You can start a new game afterwards.</p>
        <div class="dialog-actions">
          <button class="btn" id="resign-cancel">Cancel</button>
          <button class="btn btn-danger" id="resign-confirm">Resign</button>
        </div>
      </div>
    `);
    overlay.querySelector("#resign-cancel")?.addEventListener("click", () => overlay.remove());
    overlay.querySelector("#resign-confirm")?.addEventListener("click", () => {
      overlay.remove();
      if (!this.game) return;
      this.game.resign();
      this.engine.cancel();
      this.thinking = false;
      this.autosave();
      this.renderGame();
    });
  }

  private overlay(innerHtml: string): HTMLElement {
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = innerHtml;
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  private async copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast("Copied to clipboard");
    } catch {
      this.toast("Copy failed — select the text manually");
    }
  }

  private download(filename: string, text: string): void {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    this.toast("Downloaded");
  }

  private toast(message: string): void {
    let toast = document.querySelector(".toast") as HTMLElement | null;
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    window.setTimeout(() => toast?.classList.remove("show"), 1800);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
