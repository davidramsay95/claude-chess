import "./styles.css";
import { Game } from "./engine/game.js";
import { squareOf, algebraicOf, pieceType, isWhitePiece, colorOf } from "./engine/types.js";
import type { Move, Piece, Square } from "./engine/types.js";
import { pieceSvg } from "./pieces.js";
import { exportState, importState } from "./state.js";
import type { SavedState } from "./state.js";
import type { Difficulty } from "./engine/search.js";
import { installBridge } from "./bridge.js";
import type { WorkerRequest, WorkerResponse } from "./worker.js";
import { moveToSan } from "./san.js";

type Screen = "setup" | "play";

interface AppState {
  screen: Screen;
  playerColor: "white" | "black";
  difficulty: Difficulty;
  game: Game | null;
  selected: Square | null;
  legalTargets: Move[];
  thinking: boolean;
  awaitingPromo: { from: Square; to: Square } | null;
  lastMove: { from: Square; to: Square } | null;
  workerReqId: number;
}

const state: AppState = {
  screen: "setup",
  playerColor: "white",
  difficulty: "medium",
  game: null,
  selected: null,
  legalTargets: [],
  thinking: false,
  awaitingPromo: null,
  lastMove: null,
  workerReqId: 0,
};

let worker: Worker | null = null;
function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<WorkerResponse & { error?: string }>) => {
      const resp = e.data;
      if (state.game && resp.id === state.workerReqId) {
        if (resp.error) {
          console.error("engine worker error:", resp.error);
          state.thinking = false;
          render();
          return;
        }
        applyEngineMove(resp.uci);
      }
    };
  }
  return worker;
}

const app = document.getElementById("app")!;

function render() {
  app.innerHTML = "";
  if (state.screen === "setup") renderSetup();
  else renderPlay();
}

function renderSetup() {
  const panel = el("div", { class: "panel" });
  panel.style.maxWidth = "480px";
  panel.style.margin = "auto";
  panel.appendChild(el("h2", {}, "Opus 4.7 Chess"));
  panel.appendChild(el("p", { class: "legend" },
    "Play against a chess engine written from scratch. Pick a color and a difficulty, then hit Start."));

  panel.appendChild(el("h2", {}, "Your color"));
  const colorRow = el("div", { class: "color-choice" });
  for (const c of ["white", "black"] as const) {
    const b = el("button", {
      class: "btn" + (state.playerColor === c ? " selected" : ""),
      "data-color": c,
    }, c === "white" ? "White (first)" : "Black (second)");
    b.addEventListener("click", () => { state.playerColor = c; render(); });
    colorRow.appendChild(b);
  }
  panel.appendChild(colorRow);

  panel.appendChild(el("h2", {}, "Difficulty"));
  const diffRow = el("div", { class: "diff-choice" });
  for (const d of ["easy", "medium", "hard", "expert"] as const) {
    const b = el("button", {
      class: "btn" + (state.difficulty === d ? " selected" : ""),
    }, d[0].toUpperCase() + d.slice(1));
    b.addEventListener("click", () => { state.difficulty = d; render(); });
    diffRow.appendChild(b);
  }
  panel.appendChild(diffRow);

  const startBtn = el("button", { class: "btn primary" }, "Start game");
  startBtn.addEventListener("click", () => startNewGame());
  panel.appendChild(startBtn);

  const importBtn = el("button", { class: "btn" }, "Import saved game...");
  importBtn.addEventListener("click", () => showImportDialog());
  panel.appendChild(importBtn);

  app.appendChild(panel);
}

function startNewGame() {
  state.game = new Game();
  state.screen = "play";
  state.selected = null;
  state.legalTargets = [];
  state.lastMove = null;
  state.awaitingPromo = null;
  state.thinking = false;
  render();
  maybeEngineMove();
}

function renderPlay() {
  const g = state.game!;

  const boardWrap = el("div", { class: "board-wrap" });
  const board = renderBoard(g);
  boardWrap.appendChild(board);

  const statusText = getStatusText();
  const statusEl = el("div", { class: "status" + statusClass() }, statusText);
  boardWrap.appendChild(statusEl);

  app.appendChild(boardWrap);

  const side = el("div", { class: "panel" });
  side.appendChild(el("h2", {}, "Game"));
  const info = el("div", { class: "legend" },
    `You: ${state.playerColor} · Difficulty: ${state.difficulty}`);
  side.appendChild(info);

  const actions = el("div", { class: "row" });
  const newBtn = el("button", { class: "btn" }, "New game");
  newBtn.addEventListener("click", () => {
    state.screen = "setup";
    state.game = null;
    render();
  });
  actions.appendChild(newBtn);

  const resignBtn = el("button", { class: "btn danger" }, "Resign");
  resignBtn.addEventListener("click", () => {
    if (!state.game) return;
    if (state.game.endState().over) return;
    state.game.resign(state.playerColor === "white" ? "w" : "b");
    state.selected = null;
    render();
  });
  actions.appendChild(resignBtn);
  side.appendChild(actions);

  const saveRow = el("div", { class: "row" });
  const exportBtn = el("button", { class: "btn" }, "Export game");
  exportBtn.addEventListener("click", () => showExportDialog());
  saveRow.appendChild(exportBtn);
  const importBtn = el("button", { class: "btn" }, "Import game");
  importBtn.addEventListener("click", () => showImportDialog());
  saveRow.appendChild(importBtn);
  side.appendChild(saveRow);

  side.appendChild(el("h2", {}, "Move list"));
  side.appendChild(renderMoveList(g));

  app.appendChild(side);

  if (state.awaitingPromo) renderPromoOverlay();
}

function statusClass(): string {
  const g = state.game!;
  const end = g.endState();
  if (end.over) return " over";
  if (state.thinking) return " thinking";
  if (g.inCheck()) return " check";
  return "";
}

function getStatusText(): string {
  const g = state.game!;
  const end = g.endState();
  if (end.over) {
    const winnerText = end.result === "1-0" ? "White wins"
      : end.result === "0-1" ? "Black wins"
      : "Draw";
    const reasonText = end.reason === "checkmate" ? "checkmate"
      : end.reason === "stalemate" ? "stalemate"
      : end.reason === "threefold" ? "threefold repetition"
      : end.reason === "fifty" ? "fifty-move rule"
      : end.reason === "insufficient" ? "insufficient material"
      : end.reason === "resigned" ? "resignation"
      : "";
    return `${winnerText} by ${reasonText}. (${end.result})`;
  }
  const turnStr = g.turn() === "w" ? "White" : "Black";
  const yours = (g.turn() === "w") === (state.playerColor === "white");
  const checkStr = g.inCheck() ? " (in check)" : "";
  if (state.thinking) return `Engine is thinking...`;
  return `${turnStr} to move${checkStr}${yours ? " — your turn." : "."}`;
}

function renderBoard(g: Game): HTMLElement {
  const flip = state.playerColor === "black";
  const div = el("div", { class: "board" });
  const kingSq = kingSquare(g);
  const checkKingSq = g.inCheck() ? kingSq : -1;

  const legalMap = new Map<Square, Move[]>();
  if (state.selected !== null) {
    for (const mv of state.legalTargets) {
      const arr = legalMap.get(mv.to) ?? [];
      arr.push(mv);
      legalMap.set(mv.to, arr);
    }
  }

  for (let displayRank = 7; displayRank >= 0; displayRank--) {
    for (let displayFile = 0; displayFile <= 7; displayFile++) {
      const rank = flip ? 7 - displayRank : displayRank;
      const file = flip ? 7 - displayFile : displayFile;
      const sq = squareOf(file, rank);
      const isLight = (file + rank) % 2 === 1;
      const classes = ["sq", isLight ? "light" : "dark"];
      if (state.selected === sq) classes.push("selected");
      if (state.lastMove?.from === sq) classes.push("last-from");
      if (state.lastMove?.to === sq) classes.push("last-to");
      if (checkKingSq === sq) classes.push("check");
      const targetMoves = legalMap.get(sq);
      if (targetMoves) {
        classes.push(g.position.board[sq] || isEnPassantTarget(g, sq, state.selected) ? "capture" : "legal");
      }
      const sqEl = el("div", { class: classes.join(" "), "data-sq": sq.toString() });

      if (displayRank === 0) {
        const fileChar = String.fromCharCode(97 + file);
        sqEl.appendChild(el("span", { class: "coord-file" }, fileChar));
      }
      if (displayFile === 0) {
        const rankChar = (rank + 1).toString();
        sqEl.appendChild(el("span", { class: "coord-rank" }, rankChar));
      }

      const piece = g.position.board[sq];
      if (piece) sqEl.appendChild(pieceEl(piece));
      if (targetMoves) sqEl.appendChild(el("div", { class: "legal-dot" }));

      sqEl.addEventListener("click", () => handleSquareClick(sq));
      div.appendChild(sqEl);
    }
  }
  return div;
}

function isEnPassantTarget(g: Game, sq: Square, selected: Square | null): boolean {
  if (selected === null) return false;
  const p = g.position.board[selected];
  if (!p || pieceType(p) !== "p") return false;
  return g.position.epTarget === sq;
}

function kingSquare(g: Game): Square {
  const target: Piece = g.turn() === "w" ? "K" : "k";
  for (let i = 0; i < 64; i++) if (g.position.board[i] === target) return i;
  return -1;
}

function pieceEl(p: Piece): HTMLElement {
  const wrap = el("div", { class: "piece" });
  wrap.innerHTML = pieceSvg(p, 96);
  return wrap;
}

function handleSquareClick(sq: Square) {
  if (!state.game) return;
  const g = state.game;
  if (g.endState().over) return;
  if (state.thinking) return;
  if (state.awaitingPromo) return;

  const myTurn = (g.turn() === "w") === (state.playerColor === "white");
  if (!myTurn) return;

  const piece = g.position.board[sq];

  if (state.selected !== null) {
    // Attempt a move to sq
    const matching = state.legalTargets.filter(m => m.to === sq);
    if (matching.length > 0) {
      // Promotion?
      const hasPromo = matching.some(m => m.promo);
      if (hasPromo) {
        state.awaitingPromo = { from: state.selected, to: sq };
        render();
        return;
      }
      finalizePlayerMove(matching[0]);
      return;
    }
    // Clicking own piece: reselect. Clicking empty/enemy without move: clear.
    if (piece && colorOf(piece) === g.turn()) {
      selectSquare(sq);
      render();
      return;
    }
    state.selected = null;
    state.legalTargets = [];
    render();
    return;
  }

  if (piece && colorOf(piece) === g.turn()) {
    selectSquare(sq);
    render();
  }
}

function selectSquare(sq: Square) {
  if (!state.game) return;
  state.selected = sq;
  const all = state.game.legalMoves();
  state.legalTargets = all.filter(m => m.from === sq);
}

function finalizePlayerMove(mv: Move) {
  if (!state.game) return;
  const uci = uciOf(mv);
  const detail = state.game.makeUci(uci);
  if (!detail) return;
  state.lastMove = { from: mv.from, to: mv.to };
  state.selected = null;
  state.legalTargets = [];
  state.awaitingPromo = null;
  render();
  maybeEngineMove();
}

function uciOf(mv: Move): string {
  const from = algebraicOf(mv.from);
  const to = algebraicOf(mv.to);
  return from + to + (mv.promo ?? "");
}

function maybeEngineMove() {
  if (!state.game) return;
  const end = state.game.endState();
  if (end.over) return;
  const engineTurn = (state.game.turn() === "w") !== (state.playerColor === "white");
  if (!engineTurn) return;
  state.thinking = true;
  render();
  const w = getWorker();
  state.workerReqId++;
  const req: WorkerRequest = { id: state.workerReqId, fen: state.game.fen(), difficulty: state.difficulty };
  w.postMessage(req);
}

function applyEngineMove(uci: string) {
  if (!state.game) return;
  const detail = state.game.makeUci(uci);
  state.thinking = false;
  if (detail) state.lastMove = { from: detail.from, to: detail.to };
  render();
}

function renderMoveList(g: Game): HTMLElement {
  const list = el("div", { class: "move-list" });
  // Rebuild SAN via replay so we can annotate check/mate.
  const sans = buildSanList(g);
  for (let i = 0; i < sans.length; i += 2) {
    const num = Math.floor(i / 2) + 1;
    list.appendChild(el("div", { class: "num" }, `${num}.`));
    list.appendChild(el("div", { class: "san" }, sans[i]));
    list.appendChild(el("div", { class: "san" }, sans[i + 1] ?? ""));
  }
  return list;
}

function buildSanList(g: Game): string[] {
  const sans: string[] = [];
  const replay = new Game(g.startFen);
  for (const uci of g.uciHistory) {
    const legal = replay.legalMoves();
    const mv = legal.find(m => {
      const u = algebraicOf(m.from) + algebraicOf(m.to) + (m.promo ?? "");
      return u === uci;
    });
    if (!mv) { sans.push(uci); continue; }
    const san = moveToSan(replay, mv);
    replay.makeUci(uci);
    sans.push(san);
  }
  return sans;
}

function renderPromoOverlay() {
  const promo = state.awaitingPromo;
  if (!promo) return;
  const g = state.game!;
  const piece = g.position.board[promo.from];
  if (!piece) return;
  const isWhite = isWhitePiece(piece);

  const overlay = el("div", { class: "overlay" });
  const dlg = el("div", { class: "dialog" });
  dlg.appendChild(el("h1", {}, "Choose promotion"));
  const picker = el("div", { class: "promo-picker" });
  for (const promoLetter of ["q", "r", "b", "n"] as const) {
    const pieceChar = (isWhite ? promoLetter.toUpperCase() : promoLetter) as Piece;
    const b = el("button", {});
    b.innerHTML = pieceSvg(pieceChar, 80);
    b.addEventListener("click", () => {
      const mv: Move = { from: promo.from, to: promo.to, promo: promoLetter };
      finalizePlayerMove(mv);
    });
    picker.appendChild(b);
  }
  dlg.appendChild(picker);
  const cancel = el("button", { class: "btn" }, "Cancel");
  cancel.addEventListener("click", () => {
    state.awaitingPromo = null;
    render();
  });
  dlg.appendChild(cancel);
  overlay.appendChild(dlg);
  app.appendChild(overlay);
}

function showExportDialog() {
  const g = state.game!;
  const saved = exportState(g, state.playerColor, state.difficulty);
  const json = JSON.stringify(saved, null, 2);

  const overlay = el("div", { class: "overlay" });
  const dlg = el("div", { class: "dialog" });
  dlg.appendChild(el("h1", {}, "Export game"));
  const ta = el("textarea") as HTMLTextAreaElement;
  ta.value = json;
  ta.readOnly = true;
  dlg.appendChild(ta);
  const row = el("div", { class: "row" });
  const dl = el("button", { class: "btn primary" }, "Download .json");
  dl.addEventListener("click", () => downloadJson(json));
  row.appendChild(dl);
  const copy = el("button", { class: "btn" }, "Copy to clipboard");
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(json);
      copy.textContent = "Copied!";
      setTimeout(() => copy.textContent = "Copy to clipboard", 1200);
    } catch {
      ta.select();
    }
  });
  row.appendChild(copy);
  const close = el("button", { class: "btn" }, "Close");
  close.addEventListener("click", () => overlay.remove());
  row.appendChild(close);
  dlg.appendChild(row);
  overlay.appendChild(dlg);
  app.appendChild(overlay);
}

function downloadJson(json: string) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "chess-game.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function showImportDialog() {
  const overlay = el("div", { class: "overlay" });
  const dlg = el("div", { class: "dialog" });
  dlg.appendChild(el("h1", {}, "Import game"));
  dlg.appendChild(el("p", { class: "legend" }, "Paste a saved game JSON or upload a .json file."));

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/json,.json";
  fileInput.addEventListener("change", async () => {
    if (!fileInput.files || fileInput.files.length === 0) return;
    const text = await fileInput.files[0].text();
    ta.value = text;
  });
  dlg.appendChild(fileInput);

  const ta = el("textarea") as HTMLTextAreaElement;
  dlg.appendChild(ta);
  const errEl = el("div", { class: "err" });
  dlg.appendChild(errEl);

  const row = el("div", { class: "row" });
  const load = el("button", { class: "btn primary" }, "Load");
  load.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(ta.value);
      const r = importState(parsed);
      state.game = r.game;
      state.playerColor = r.playerColor;
      state.difficulty = r.difficulty;
      state.selected = null;
      state.legalTargets = [];
      state.lastMove = null;
      state.awaitingPromo = null;
      state.thinking = false;
      state.screen = "play";
      overlay.remove();
      render();
      maybeEngineMove();
    } catch (e) {
      errEl.textContent = e instanceof Error ? e.message : String(e);
    }
  });
  row.appendChild(load);
  const close = el("button", { class: "btn" }, "Cancel");
  close.addEventListener("click", () => overlay.remove());
  row.appendChild(close);
  dlg.appendChild(row);
  overlay.appendChild(dlg);
  app.appendChild(overlay);
}

function el(tag: string, attrs: Record<string, string> = {}, text?: string): HTMLElement {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

// Bridge to shell -------------------------------------------------------------

installBridge({
  addEventListener: (t, l) => window.addEventListener(t, l),
  removeEventListener: (t, l) => window.removeEventListener(t, l),
  location: window.location,
  parent: window.parent,
  postMessage: (msg, targetOrigin) => window.parent.postMessage(msg, targetOrigin),
}, {
  onRequestState: () => {
    if (state.screen !== "play" || !state.game) return { state: null, summary: null };
    const g = state.game;
    const saved: SavedState = exportState(g, state.playerColor, state.difficulty);
    const end = g.endState();
    const summary = { result: end.result, moveCount: g.uciHistory.length };
    return { state: saved, summary };
  },
  onLoadState: (unknownState) => {
    try {
      const r = importState(unknownState);
      state.game = r.game;
      state.playerColor = r.playerColor;
      state.difficulty = r.difficulty;
      state.selected = null;
      state.legalTargets = [];
      state.lastMove = null;
      state.awaitingPromo = null;
      state.thinking = false;
      state.screen = "play";
      render();
      maybeEngineMove();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
});

render();
