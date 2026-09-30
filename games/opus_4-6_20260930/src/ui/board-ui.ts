import { ChessGame } from "../chess/game.js";
import {
  type Move,
  type Color,
  type Difficulty,
  type GameState,
  EMPTY,
  WHITE,
  BLACK,
  QUEEN,
  sq88,
  pieceColor,
  moveToUci,
} from "../chess/types.js";
import { START_FEN } from "../chess/board.js";
import { getPieceSvg, type PieceChar } from "./pieces.js";
import { initBridge, validateGameState } from "../bridge.js";

const PIECE_CHARS = " PNBRQK  pnbrqk";

function pieceToChar(p: number): PieceChar | null {
  const ch = PIECE_CHARS[p];
  if (!ch || ch === " " || ch === "x") return null;
  return ch as PieceChar;
}

type GamePhase = "setup" | "playing" | "gameover";

interface AppState {
  phase: GamePhase;
  game: ChessGame;
  playerColor: Color;
  difficulty: Difficulty;
  moveHistory: { uci: string; san: string }[];
  selectedSquare: number | null;
  legalTargets: Set<number>;
  engineThinking: boolean;
  startFen: string;
  resigned: boolean;
  result: string;
  resultReason: string;
  pendingPromotion: {
    from: number;
    to: number;
    moves: Move[];
  } | null;
  boardFlipped: boolean;
}

let state: AppState = {
  phase: "setup",
  game: new ChessGame(),
  playerColor: WHITE,
  difficulty: "medium",
  moveHistory: [],
  selectedSquare: null,
  legalTargets: new Set(),
  engineThinking: false,
  startFen: START_FEN,
  resigned: false,
  result: "*",
  resultReason: "",
  pendingPromotion: null,
  boardFlipped: false,
};

let worker: Worker | null = null;
let rootEl: HTMLElement;

function getStorageKey(key: string): string {
  return `opus_4-6_20260930_${key}`;
}

function initWorker(): void {
  worker = new Worker(new URL("../engine/worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (e): void => {
    if (e.data.type === "result") {
      handleEngineMove(e.data.bestMove);
    }
  };
}

function requestEngineMove(): void {
  if (!worker || state.phase !== "playing") return;
  state.engineThinking = true;
  render();

  worker.postMessage({
    type: "search",
    fen: state.game.fen(),
    difficulty: state.difficulty,
  });
}

function handleEngineMove(uci: string): void {
  if (state.phase !== "playing") return;

  const move = state.game.findMoveByUci(uci);
  if (!move) {
    state.engineThinking = false;
    render();
    return;
  }

  const san = state.game.moveToSan(move);
  state.game.makeMove(move);
  state.moveHistory.push({ uci: moveToUci(move), san });
  state.engineThinking = false;
  state.selectedSquare = null;
  state.legalTargets = new Set();

  checkGameOver();
  render();
}

function checkGameOver(): void {
  if (state.game.isCheckmate()) {
    state.phase = "gameover";
    state.result = state.game.getResult();
    state.resultReason = "Checkmate";
  } else if (state.game.isStalemate()) {
    state.phase = "gameover";
    state.result = "1/2-1/2";
    state.resultReason = "Stalemate";
  } else if (state.game.isThreefoldRepetition()) {
    state.phase = "gameover";
    state.result = "1/2-1/2";
    state.resultReason = "Threefold repetition";
  } else if (state.game.isFiftyMoveRule()) {
    state.phase = "gameover";
    state.result = "1/2-1/2";
    state.resultReason = "Fifty-move rule";
  } else if (state.game.isInsufficientMaterial()) {
    state.phase = "gameover";
    state.result = "1/2-1/2";
    state.resultReason = "Insufficient material";
  }
}

function startGame(playerColor: Color, difficulty: Difficulty): void {
  state = {
    phase: "playing",
    game: new ChessGame(),
    playerColor,
    difficulty,
    moveHistory: [],
    selectedSquare: null,
    legalTargets: new Set(),
    engineThinking: false,
    startFen: START_FEN,
    resigned: false,
    result: "*",
    resultReason: "",
    pendingPromotion: null,
    boardFlipped: playerColor === BLACK,
  };

  render();

  if (playerColor === BLACK) {
    requestEngineMove();
  }
}

function handleSquareClick(sq64: number): void {
  if (state.phase !== "playing" || state.engineThinking) return;
  if (state.game.state.turn !== state.playerColor) return;

  const rank = Math.floor(sq64 / 8);
  const file = sq64 % 8;
  const sq = sq88(rank, file);

  if (state.selectedSquare !== null) {
    if (state.legalTargets.has(sq)) {
      const legal = state.game.getLegalMoves();
      const matching = legal.filter(
        (m) => m.from === state.selectedSquare && m.to === sq,
      );

      if (matching.length > 1 && matching[0].promotion) {
        state.pendingPromotion = { from: state.selectedSquare, to: sq, moves: matching };
        render();
        return;
      }

      if (matching.length === 1) {
        executePlayerMove(matching[0]);
        return;
      }
    }

    state.selectedSquare = null;
    state.legalTargets = new Set();

    const piece = state.game.state.board[sq];
    if (piece !== EMPTY && pieceColor(piece) === state.playerColor) {
      selectSquare(sq);
    } else {
      render();
    }
    return;
  }

  const piece = state.game.state.board[sq];
  if (piece !== EMPTY && pieceColor(piece) === state.playerColor) {
    selectSquare(sq);
  }
}

function selectSquare(sq: number): void {
  state.selectedSquare = sq;
  const legal = state.game.getLegalMoves();
  state.legalTargets = new Set(
    legal.filter((m) => m.from === sq).map((m) => m.to),
  );
  render();
}

function handlePromotion(pieceTypeVal: number): void {
  if (!state.pendingPromotion) return;
  const move = state.pendingPromotion.moves.find(
    (m) => m.promotion === pieceTypeVal,
  );
  state.pendingPromotion = null;
  if (move) {
    executePlayerMove(move);
  } else {
    render();
  }
}

function executePlayerMove(move: Move): void {
  const san = state.game.moveToSan(move);
  state.game.makeMove(move);
  state.moveHistory.push({ uci: moveToUci(move), san });
  state.selectedSquare = null;
  state.legalTargets = new Set();

  checkGameOver();
  render();

  if (state.phase === "playing") {
    requestEngineMove();
  }
}

function resign(): void {
  if (state.phase !== "playing") return;
  state.phase = "gameover";
  state.resigned = true;
  state.result = state.playerColor === WHITE ? "0-1" : "1-0";
  state.resultReason = "Resignation";
  render();
}

function getExportState(): GameState | null {
  if (state.phase === "setup") return null;
  return {
    version: 1,
    startFen: state.startFen,
    playerColor: state.playerColor === WHITE ? "white" : "black",
    difficulty: state.difficulty,
    moves: state.moveHistory.map((m) => m.uci),
    resigned: state.resigned,
  };
}

function getSummary(): { result: string; moveCount: number } | null {
  if (state.phase === "setup") return null;
  return {
    result: state.result,
    moveCount: state.moveHistory.length,
  };
}

function importState(
  gs: GameState,
): { ok: boolean; error?: string } {
  const validation = validateGameState(gs);
  if (!validation.valid) {
    return { ok: false, error: validation.error };
  }

  const validState = validation.state;

  let testGame: ChessGame;
  try {
    testGame = new ChessGame(validState.startFen);
  } catch {
    return { ok: false, error: "Invalid startFen" };
  }

  const sanHistory: { uci: string; san: string }[] = [];

  for (let i = 0; i < validState.moves.length; i++) {
    const uci = validState.moves[i];
    const move = testGame.findMoveByUci(uci);
    if (!move) {
      return {
        ok: false,
        error: `Move ${i + 1} (${uci}) is not legal`,
      };
    }
    const san = testGame.moveToSan(move);
    testGame.makeMove(move);
    sanHistory.push({ uci, san });
  }

  state = {
    phase: testGame.isGameOver() || validState.resigned ? "gameover" : "playing",
    game: testGame,
    playerColor: validState.playerColor === "white" ? WHITE : BLACK,
    difficulty: validState.difficulty,
    moveHistory: sanHistory,
    selectedSquare: null,
    legalTargets: new Set(),
    engineThinking: false,
    startFen: validState.startFen,
    resigned: validState.resigned,
    result: "*",
    resultReason: "",
    pendingPromotion: null,
    boardFlipped: validState.playerColor === "black",
  };

  if (validState.resigned) {
    state.result = state.playerColor === WHITE ? "0-1" : "1-0";
    state.resultReason = "Resignation";
  } else if (testGame.isGameOver()) {
    if (testGame.isCheckmate()) {
      state.result = testGame.getResult();
      state.resultReason = "Checkmate";
    } else {
      state.result = "1/2-1/2";
      if (testGame.isStalemate()) state.resultReason = "Stalemate";
      else if (testGame.isThreefoldRepetition())
        state.resultReason = "Threefold repetition";
      else if (testGame.isFiftyMoveRule())
        state.resultReason = "Fifty-move rule";
      else if (testGame.isInsufficientMaterial())
        state.resultReason = "Insufficient material";
    }
  }

  render();

  if (
    state.phase === "playing" &&
    state.game.state.turn !== state.playerColor
  ) {
    requestEngineMove();
  }

  return { ok: true };
}

function exportToClipboard(): void {
  const gs = getExportState();
  if (!gs) return;
  const json = JSON.stringify(gs, null, 2);
  navigator.clipboard.writeText(json).catch(() => {
    downloadJson(json);
  });
}

function exportToFile(): void {
  const gs = getExportState();
  if (!gs) return;
  downloadJson(JSON.stringify(gs, null, 2));
}

function downloadJson(json: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "chess-game.json";
  a.click();
  URL.revokeObjectURL(url);
}

function handleImportFile(file: File): void {
  const reader = new FileReader();
  reader.onload = (): void => {
    try {
      const gs = JSON.parse(reader.result as string);
      const result = importState(gs);
      if (!result.ok) {
        showError(result.error ?? "Import failed");
      }
    } catch {
      showError("Invalid JSON file");
    }
  };
  reader.readAsText(file);
}

function handleImportText(text: string): void {
  try {
    const gs = JSON.parse(text);
    const result = importState(gs);
    if (!result.ok) {
      showError(result.error ?? "Import failed");
    }
  } catch {
    showError("Invalid JSON");
  }
}

let errorTimeout: ReturnType<typeof setTimeout> | null = null;
let errorMessage = "";

function showError(msg: string): void {
  errorMessage = msg;
  render();
  if (errorTimeout) clearTimeout(errorTimeout);
  errorTimeout = setTimeout(() => {
    errorMessage = "";
    render();
  }, 4000);
}

function renderBoard(): string {
  const board = state.game.state.board;
  const flipped = state.boardFlipped;
  let html = '<div class="board">';

  for (let visualRow = 0; visualRow < 8; visualRow++) {
    for (let visualCol = 0; visualCol < 8; visualCol++) {
      const rank = flipped ? visualRow : 7 - visualRow;
      const file = flipped ? 7 - visualCol : visualCol;
      const sq = sq88(rank, file);
      const sq64 = rank * 8 + file;
      const isLight = (rank + file) % 2 === 1;
      const piece = board[sq];

      let classes = `square ${isLight ? "light" : "dark"}`;

      if (state.selectedSquare === sq) {
        classes += " selected";
      }
      if (state.legalTargets.has(sq)) {
        classes += piece !== EMPTY ? " target-capture" : " target";
      }

      const lastMove = state.moveHistory.length > 0 ? state.moveHistory[state.moveHistory.length - 1] : null;
      if (lastMove) {
        const fromAlg = lastMove.uci.substring(0, 2);
        const toAlg = lastMove.uci.substring(2, 4);
        const fromFile = fromAlg.charCodeAt(0) - 97;
        const fromRank = parseInt(fromAlg[1]) - 1;
        const toFile = toAlg.charCodeAt(0) - 97;
        const toRank = parseInt(toAlg[1]) - 1;
        if ((rank === fromRank && file === fromFile) || (rank === toRank && file === toFile)) {
          classes += " last-move";
        }
      }

      let content = "";
      if (piece !== EMPTY) {
        const ch = pieceToChar(piece);
        if (ch) {
          content = getPieceSvg(ch);
        }
      }

      if (state.legalTargets.has(sq) && piece === EMPTY) {
        content = '<div class="move-dot"></div>';
      }

      const coordLabel = visualCol === 0
        ? `<span class="coord-rank">${rank + 1}</span>`
        : "";
      const fileLabel = visualRow === 7
        ? `<span class="coord-file">${String.fromCharCode(97 + file)}</span>`
        : "";

      html += `<div class="${classes}" data-sq="${sq64}" onclick="window.__handleSquareClick(${sq64})">${coordLabel}${fileLabel}${content}</div>`;
    }
  }

  html += "</div>";
  return html;
}

function renderPromotionDialog(): string {
  if (!state.pendingPromotion) return "";
  const color = state.playerColor === WHITE ? "white" : "black";
  const pieces: [number, string][] = [
    [QUEEN, color === "white" ? "Q" : "q"],
    [4, color === "white" ? "R" : "r"],
    [3, color === "white" ? "B" : "b"],
    [2, color === "white" ? "N" : "n"],
  ];

  let html = '<div class="promotion-overlay">';
  html += '<div class="promotion-dialog">';
  html += "<h3>Promote to:</h3>";
  html += '<div class="promotion-options">';
  for (const [pt, ch] of pieces) {
    html += `<button class="promotion-btn" onclick="window.__handlePromotion(${pt})">${getPieceSvg(ch as PieceChar)}</button>`;
  }
  html += "</div></div></div>";
  return html;
}

function renderMoveList(): string {
  let html = '<div class="move-list"><div class="move-list-header">Moves</div><div class="move-list-body">';
  for (let i = 0; i < state.moveHistory.length; i += 2) {
    const moveNum = Math.floor(i / 2) + 1;
    const white = state.moveHistory[i]?.san ?? "";
    const black = state.moveHistory[i + 1]?.san ?? "";
    html += `<div class="move-row"><span class="move-num">${moveNum}.</span><span class="move-white">${white}</span><span class="move-black">${black}</span></div>`;
  }
  html += "</div></div>";
  return html;
}

function renderSetup(): string {
  let html = '<div class="setup">';
  html += '<h1 class="title">Opus Chess</h1>';
  html += '<p class="subtitle">Claude Opus 4.6 engine</p>';

  html += '<div class="setup-section">';
  html += '<label>Play as</label>';
  html += '<div class="btn-group">';
  html += `<button class="btn ${state.playerColor === WHITE ? "active" : ""}" onclick="window.__setPlayerColor(0)">White</button>`;
  html += `<button class="btn ${state.playerColor === BLACK ? "active" : ""}" onclick="window.__setPlayerColor(1)">Black</button>`;
  html += "</div></div>";

  html += '<div class="setup-section">';
  html += "<label>Difficulty</label>";
  html += '<div class="btn-group">';
  for (const d of ["easy", "medium", "hard", "expert"] as Difficulty[]) {
    html += `<button class="btn ${state.difficulty === d ? "active" : ""}" onclick="window.__setDifficulty('${d}')">${d.charAt(0).toUpperCase() + d.slice(1)}</button>`;
  }
  html += "</div></div>";

  html += `<button class="btn btn-primary" onclick="window.__startGame()">Start Game</button>`;

  html += '<div class="setup-section import-section">';
  html += '<label>Import game</label>';
  html += '<div class="import-actions">';
  html += '<label class="btn btn-sm" for="import-file">From file</label>';
  html += '<input type="file" id="import-file" accept=".json" style="display:none" onchange="window.__handleImportFile(this)">';
  html += '<button class="btn btn-sm" onclick="window.__showImportText()">From clipboard</button>';
  html += "</div></div>";

  html += "</div>";
  return html;
}

function renderGame(): string {
  let html = '<div class="game-layout">';

  html += '<div class="board-panel">';

  const engineColor = state.playerColor === WHITE ? "Black" : "White";
  const playerColorLabel = state.playerColor === WHITE ? "White" : "Black";

  html += `<div class="player-label top-label">${engineColor} (Engine - ${state.difficulty})${state.engineThinking ? ' <span class="thinking">thinking...</span>' : ""}</div>`;

  html += renderBoard();

  html += `<div class="player-label bottom-label">${playerColorLabel} (You)</div>`;

  html += "</div>";

  html += '<div class="side-panel">';
  html += renderMoveList();

  if (state.phase === "gameover") {
    html += `<div class="game-result"><div class="result-score">${state.result}</div><div class="result-reason">${state.resultReason}</div></div>`;
  }

  html += '<div class="game-actions">';
  if (state.phase === "playing") {
    html += '<button class="btn btn-danger" onclick="window.__resign()">Resign</button>';
  }
  html += '<button class="btn btn-sm" onclick="window.__exportToClipboard()">Copy state</button>';
  html += '<button class="btn btn-sm" onclick="window.__exportToFile()">Save .json</button>';
  if (state.phase === "gameover") {
    html += '<button class="btn btn-primary" onclick="window.__newGame()">New Game</button>';
  }
  html += "</div></div>";

  html += "</div>";

  html += renderPromotionDialog();

  return html;
}

function renderImportModal(): string {
  return `<div class="promotion-overlay" onclick="window.__hideImportText(event)">
    <div class="import-modal" onclick="event.stopPropagation()">
      <h3>Paste game state JSON</h3>
      <textarea id="import-textarea" rows="8" placeholder='{"version": 1, ...}'></textarea>
      <div class="import-modal-actions">
        <button class="btn btn-sm" onclick="window.__hideImportText()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="window.__importFromTextarea()">Import</button>
      </div>
    </div>
  </div>`;
}

let showImportModal = false;

function render(): void {
  let html = "";

  if (state.phase === "setup") {
    html = renderSetup();
  } else {
    html = renderGame();
  }

  if (showImportModal) {
    html += renderImportModal();
  }

  if (errorMessage) {
    html += `<div class="error-toast">${errorMessage}</div>`;
  }

  rootEl.innerHTML = html;
}

function setupGlobalHandlers(): void {
  const w = window as unknown as Record<string, unknown>;

  w.__handleSquareClick = handleSquareClick;
  w.__handlePromotion = handlePromotion;
  w.__resign = resign;
  w.__exportToClipboard = exportToClipboard;
  w.__exportToFile = exportToFile;
  w.__newGame = (): void => {
    state.phase = "setup";
    render();
  };
  w.__startGame = (): void => {
    startGame(state.playerColor, state.difficulty);
  };
  w.__setPlayerColor = (c: number): void => {
    state.playerColor = c as Color;
    render();
  };
  w.__setDifficulty = (d: string): void => {
    state.difficulty = d as Difficulty;
    render();
  };
  w.__handleImportFile = (input: HTMLInputElement): void => {
    const file = input.files?.[0];
    if (file) handleImportFile(file);
  };
  w.__showImportText = (): void => {
    showImportModal = true;
    render();
  };
  w.__hideImportText = (e?: Event): void => {
    if (e && (e.target as HTMLElement).classList.contains("import-modal")) return;
    showImportModal = false;
    render();
  };
  w.__importFromTextarea = (): void => {
    const ta = document.getElementById("import-textarea") as HTMLTextAreaElement;
    if (ta?.value) {
      showImportModal = false;
      handleImportText(ta.value);
    }
  };
}

export function initApp(el: HTMLElement): void {
  rootEl = el;
  initWorker();
  setupGlobalHandlers();

  initBridge({
    getState: () => ({
      state: getExportState(),
      summary: getSummary(),
    }),
    loadState: importState,
  });

  const savedDifficulty = localStorage.getItem(getStorageKey("difficulty"));
  if (savedDifficulty && ["easy", "medium", "hard", "expert"].includes(savedDifficulty)) {
    state.difficulty = savedDifficulty as Difficulty;
  }

  render();
}
