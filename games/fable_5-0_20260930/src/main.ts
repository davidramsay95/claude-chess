/**
 * Fable Chess interface: setup screen, board interaction, move list with
 * review navigation, export/import, and the shell save bridge. All rules run
 * in the engine module; the AI runs in a Web Worker so the page never blocks.
 */
import "./style.css";
import {
  BLACK,
  Board,
  KING,
  WHITE,
  moveFrom,
  movePromo,
  moveTo,
  type ColorIndex
} from "./engine/board";
import { initBridge } from "./bridge";
import {
  applyUci,
  createGame,
  exportState,
  gameSummary,
  importState,
  type Difficulty,
  type Game,
  type PlayerColor
} from "./state";
import { PIECE_NAMES, colorName, pieceSvg } from "./ui/pieces";
import {
  playCapture,
  playCheck,
  playGameEnd,
  playMove,
  setSoundEnabled,
  soundEnabled
} from "./ui/sound";
import type { EngineReply, EngineRequest } from "./worker";

const STORAGE_PREFIX = "fable_5-0_20260930:";

const DIFFICULTY_COPY: Record<Difficulty, string> = {
  easy: "Relaxed. Overlooks things, like you might.",
  medium: "A solid club player. Rarely hangs a piece.",
  hard: "Sharp. Punishes loose moves.",
  expert: "Thinks for several seconds. Bring a plan."
};

interface AppState {
  screen: "setup" | "game";
  game: Game | null;
  viewIndex: number;
  thinking: boolean;
  selection: number | null;
  setupColor: PlayerColor;
  setupDifficulty: Difficulty;
}

const state: AppState = {
  screen: "setup",
  game: null,
  viewIndex: 0,
  thinking: false,
  selection: null,
  setupColor: "white",
  setupDifficulty: "medium"
};

try {
  const savedColor = window.localStorage.getItem(`${STORAGE_PREFIX}color`);
  const savedLevel = window.localStorage.getItem(`${STORAGE_PREFIX}difficulty`);
  if (savedColor === "white" || savedColor === "black") state.setupColor = savedColor;
  if (savedLevel === "easy" || savedLevel === "medium" || savedLevel === "hard" || savedLevel === "expert") {
    state.setupDifficulty = savedLevel;
  }
} catch {
  // Defaults stand when storage is unavailable.
}

const app = document.getElementById("app") as HTMLDivElement;

const engine = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
let engineSeq = 0;
let engineAskedAt = 0;

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const playerIndex = (game: Game): ColorIndex => (game.playerColor === "white" ? WHITE : BLACK);

const isLive = (): boolean => state.game !== null && state.viewIndex === state.game.moves.length;

const viewedBoard = (): Board => {
  const game = state.game;
  if (!game) return Board.fromFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  if (state.viewIndex === game.moves.length) return game.board;
  const board = Board.fromFen(game.startFen);
  for (let i = 0; i < state.viewIndex; i++) {
    const uci = game.moves[i];
    if (uci === undefined) break;
    const move = board.uciToMove(uci);
    if (move === null) break;
    board.makeMove(move);
  }
  return board;
};

const gameOver = (game: Game): boolean => game.resigned || game.board.status() !== "playing";

const applyWithSound = (game: Game, uci: string): void => {
  const move = game.board.uciToMove(uci);
  const captureSound = move !== null && game.board.san(move).includes("x");
  applyUci(game, uci);
  const status = game.board.status();
  if (status !== "playing") {
    const summary = gameSummary(game);
    const won =
      (summary.result === "1-0" && game.playerColor === "white") ||
      (summary.result === "0-1" && game.playerColor === "black");
    playGameEnd(won);
  } else if (game.board.inCheck()) {
    playCheck();
  } else if (captureSound) {
    playCapture();
  } else {
    playMove();
  }
};

/* ------------------------------------------------------------------ */
/* Engine turn                                                        */
/* ------------------------------------------------------------------ */

const cancelThinking = (): void => {
  engineSeq++;
  state.thinking = false;
};

const maybeEngineMove = (): void => {
  const game = state.game;
  if (!game || gameOver(game) || state.thinking) return;
  if (game.board.turnIndex() === playerIndex(game)) return;
  state.thinking = true;
  engineSeq++;
  engineAskedAt = Date.now();
  const request: EngineRequest = {
    requestId: engineSeq,
    startFen: game.startFen,
    moves: [...game.moves],
    difficulty: game.difficulty
  };
  engine.postMessage(request);
  render();
};

engine.onmessage = (event: MessageEvent<EngineReply>) => {
  const { requestId, uci, error } = event.data;
  if (requestId !== engineSeq) return;
  const finish = (): void => {
    const game = state.game;
    if (!game || requestId !== engineSeq) return;
    state.thinking = false;
    if (uci !== null && !gameOver(game)) {
      applyWithSound(game, uci);
      state.viewIndex = game.moves.length;
    } else if (error) {
      console.error(`Engine error: ${error}`);
    }
    render();
  };
  // A tiny floor on reply time keeps instant moves from feeling jarring.
  const elapsed = Date.now() - engineAskedAt;
  window.setTimeout(finish, Math.max(0, 350 - elapsed));
};

/* ------------------------------------------------------------------ */
/* Rendering                                                          */
/* ------------------------------------------------------------------ */

const render = (): void => {
  if (state.screen === "setup") {
    renderSetup();
  } else {
    renderGame();
  }
};

const renderSetup = (): void => {
  app.innerHTML = "";
  const screen = document.createElement("div");
  screen.className = "setup";

  const title = document.createElement("div");
  title.className = "setup-title";
  title.innerHTML = `<h1>Fable Chess</h1><p>A chess engine written by Claude Fable, told in four tempers.</p>`;
  screen.appendChild(title);

  const colors = document.createElement("div");
  colors.className = "color-choice";
  for (const color of ["white", "black"] as const) {
    const card = document.createElement("button");
    card.className = "color-card";
    card.type = "button";
    card.setAttribute("aria-pressed", String(state.setupColor === color));
    card.innerHTML = `${pieceSvg(KING, color === "white" ? WHITE : BLACK)}<span>Play ${color}</span><small>${
      color === "white" ? "You move first" : "Fable moves first"
    }</small>`;
    card.addEventListener("click", () => {
      state.setupColor = color;
      renderSetup();
    });
    colors.appendChild(card);
  }
  screen.appendChild(colors);

  const levels = document.createElement("div");
  levels.className = "difficulty";
  levels.setAttribute("role", "group");
  levels.setAttribute("aria-label", "Difficulty");
  for (const level of ["easy", "medium", "hard", "expert"] as const) {
    const option = document.createElement("button");
    option.className = "difficulty-option";
    option.type = "button";
    option.setAttribute("aria-pressed", String(state.setupDifficulty === level));
    option.innerHTML = `<strong>${level[0]?.toUpperCase()}${level.slice(1)}</strong><small>${DIFFICULTY_COPY[level]}</small>`;
    option.addEventListener("click", () => {
      state.setupDifficulty = level;
      renderSetup();
    });
    levels.appendChild(option);
  }
  screen.appendChild(levels);

  const start = document.createElement("button");
  start.className = "start-button";
  start.type = "button";
  start.textContent = "Start game";
  start.addEventListener("click", () => {
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}color`, state.setupColor);
      window.localStorage.setItem(`${STORAGE_PREFIX}difficulty`, state.setupDifficulty);
    } catch {
      // Preference persistence is optional.
    }
    startGame(createGame(state.setupColor, state.setupDifficulty));
  });
  screen.appendChild(start);

  const importLink = document.createElement("button");
  importLink.className = "setup-import";
  importLink.type = "button";
  importLink.textContent = "Import a saved game";
  importLink.addEventListener("click", openImportDialog);
  screen.appendChild(importLink);

  app.appendChild(screen);
};

const startGame = (game: Game): void => {
  cancelThinking();
  state.game = game;
  state.screen = "game";
  state.viewIndex = game.moves.length;
  state.selection = null;
  render();
  maybeEngineMove();
};

const statusText = (game: Game): { text: string; alert: boolean; thinking: boolean } => {
  if (game.resigned) {
    return {
      text: `You resigned. ${game.playerColor === "white" ? "Black" : "White"} wins.`,
      alert: false,
      thinking: false
    };
  }
  const status = game.board.status();
  if (status === "checkmate") {
    const playerWon = game.board.turnIndex() !== playerIndex(game);
    return { text: playerWon ? "Checkmate. You win." : "Checkmate. Fable wins.", alert: !playerWon, thinking: false };
  }
  if (status === "stalemate") return { text: "Stalemate. Drawn game.", alert: false, thinking: false };
  if (status === "draw-fifty") return { text: "Draw by the fifty-move rule.", alert: false, thinking: false };
  if (status === "draw-repetition") return { text: "Draw by threefold repetition.", alert: false, thinking: false };
  if (status === "draw-material") return { text: "Draw. Neither side can mate.", alert: false, thinking: false };
  if (state.thinking) return { text: "Fable is thinking…", alert: false, thinking: true };
  if (game.board.inCheck()) return { text: "Check. Your move.", alert: true, thinking: false };
  return { text: "Your move.", alert: false, thinking: false };
};

const renderGame = (): void => {
  const game = state.game;
  if (!game) return;
  app.innerHTML = "";

  const screen = document.createElement("div");
  screen.className = "game";

  const boardWrap = document.createElement("div");
  boardWrap.className = "board-wrap";
  boardWrap.appendChild(renderBoard(game));
  screen.appendChild(boardWrap);

  const panel = document.createElement("div");
  panel.className = "panel";

  const status = document.createElement("div");
  const info = statusText(game);
  status.className = `status${info.alert ? " alert" : ""}`;
  status.setAttribute("role", "status");
  if (info.thinking) {
    const dot = document.createElement("span");
    dot.className = "thinking-dot";
    status.appendChild(dot);
  }
  status.appendChild(document.createTextNode(info.text));
  panel.appendChild(status);

  if (!isLive()) {
    const banner = document.createElement("div");
    banner.className = "review-banner";
    const label = document.createElement("span");
    label.textContent = `Reviewing move ${state.viewIndex} of ${game.moves.length}`;
    const back = document.createElement("button");
    back.type = "button";
    back.textContent = "Back to game";
    back.addEventListener("click", () => {
      state.viewIndex = game.moves.length;
      render();
    });
    banner.append(label, back);
    panel.appendChild(banner);
  }

  panel.appendChild(renderMoveList(game));
  panel.appendChild(renderNav(game));
  panel.appendChild(renderActions(game));
  screen.appendChild(panel);
  app.appendChild(screen);
};

const renderBoard = (game: Game): HTMLElement => {
  const board = viewedBoard();
  const flipped = game.playerColor === "black";
  const grid = document.createElement("div");
  grid.className = "board";
  grid.setAttribute("role", "grid");
  grid.setAttribute("aria-label", "Chess board");

  const selection = state.selection;
  const targets = new Map<number, number[]>();
  if (selection !== null && isLive()) {
    for (const move of game.board.legalMoves()) {
      if (moveFrom(move) === selection) {
        const list = targets.get(moveTo(move)) ?? [];
        list.push(move);
        targets.set(moveTo(move), list);
      }
    }
  }

  const lastUci = game.moves.length > 0 && state.viewIndex > 0 ? game.moves[state.viewIndex - 1] : undefined;
  const lastFrom = lastUci ? lastUci.slice(0, 2) : "";
  const lastTo = lastUci ? lastUci.slice(2, 4) : "";

  const inCheck = board.inCheck();
  const checkedColor = board.turnIndex();

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const rank = flipped ? row : 7 - row;
      const file = flipped ? 7 - col : col;
      const sq = rank * 16 + file;
      const algebraic = `${String.fromCharCode(97 + file)}${rank + 1}`;
      const piece = board.pieceAt(sq);

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `square ${(rank + file) % 2 === 0 ? "dark" : "light"}`;
      cell.setAttribute("role", "gridcell");
      cell.dataset.square = String(sq);
      const contents = piece ? `${colorName(piece.color)} ${PIECE_NAMES[piece.type] ?? ""}` : "empty";
      cell.setAttribute("aria-label", `${algebraic}, ${contents}`);

      if (piece) cell.innerHTML = pieceSvg(piece.type, piece.color);
      if (algebraic === lastFrom || algebraic === lastTo) cell.classList.add("last-move");
      if (selection === sq) cell.classList.add("selected");
      if (targets.has(sq)) {
        cell.classList.add("target");
        if (piece) cell.classList.add("has-piece");
      }
      if (inCheck && piece && piece.type === KING && piece.color === checkedColor) {
        cell.classList.add("in-check");
      }

      if (row === 7) {
        const coord = document.createElement("span");
        coord.className = "coord file";
        coord.textContent = String.fromCharCode(97 + file);
        cell.appendChild(coord);
      }
      if (col === 0) {
        const coord = document.createElement("span");
        coord.className = "coord rank";
        coord.textContent = String(rank + 1);
        cell.appendChild(coord);
      }

      cell.addEventListener("click", () => onSquareClick(sq, targets.get(sq)));
      grid.appendChild(cell);
    }
  }
  return grid;
};

const onSquareClick = (sq: number, matching: number[] | undefined): void => {
  const game = state.game;
  if (!game || !isLive() || state.thinking || gameOver(game)) return;
  if (game.board.turnIndex() !== playerIndex(game)) return;

  if (matching && matching.length > 0) {
    const promotions = matching.filter((move) => movePromo(move) !== 0);
    if (promotions.length > 0) {
      openPromotionDialog(game, promotions);
    } else {
      const move = matching[0];
      if (move !== undefined) playPlayerMove(game, move);
    }
    return;
  }

  const piece = game.board.pieceAt(sq);
  if (piece && piece.color === playerIndex(game)) {
    state.selection = state.selection === sq ? null : sq;
  } else {
    state.selection = null;
  }
  render();
};

const playPlayerMove = (game: Game, move: number): void => {
  applyWithSound(game, game.board.moveToUci(move));
  state.selection = null;
  state.viewIndex = game.moves.length;
  render();
  maybeEngineMove();
};

const renderMoveList = (game: Game): HTMLElement => {
  const list = document.createElement("div");
  list.className = "moves";
  list.setAttribute("aria-label", "Moves played");
  if (game.sans.length === 0) {
    list.innerHTML = `<span class="empty">No moves yet.</span>`;
    return list;
  }
  const whiteStarts = game.startFen.split(" ")[1] !== "b";
  const startNumber = Number.parseInt(game.startFen.split(" ")[5] ?? "1", 10) || 1;
  game.sans.forEach((san, index) => {
    const isWhiteMove = whiteStarts ? index % 2 === 0 : index % 2 === 1;
    if (index === 0 || isWhiteMove) {
      const number = document.createElement("span");
      number.className = "move-number";
      const moveNo = startNumber + Math.floor((index + (whiteStarts ? 0 : 1)) / 2);
      number.textContent = `${moveNo}.${index === 0 && !whiteStarts ? ".." : ""}`;
      list.appendChild(number);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = `move${state.viewIndex === index + 1 ? " current" : ""}`;
    button.textContent = san;
    button.addEventListener("click", () => {
      state.viewIndex = index + 1;
      state.selection = null;
      render();
    });
    list.appendChild(button);
  });
  return list;
};

const renderNav = (game: Game): HTMLElement => {
  const nav = document.createElement("div");
  nav.className = "nav";
  const entries: Array<{ label: string; target: number; title: string }> = [
    { label: "⏮", target: 0, title: "First position" },
    { label: "◀", target: Math.max(0, state.viewIndex - 1), title: "Previous move" },
    { label: "▶", target: Math.min(game.moves.length, state.viewIndex + 1), title: "Next move" },
    { label: "⏭", target: game.moves.length, title: "Latest position" }
  ];
  for (const entry of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = entry.label;
    button.title = entry.title;
    button.setAttribute("aria-label", entry.title);
    button.disabled = entry.target === state.viewIndex;
    button.addEventListener("click", () => {
      state.viewIndex = entry.target;
      state.selection = null;
      render();
    });
    nav.appendChild(button);
  }
  return nav;
};

const renderActions = (game: Game): HTMLElement => {
  const actions = document.createElement("div");
  actions.className = "actions";

  const add = (label: string, onClick: () => void, danger = false): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (danger) button.classList.add("danger");
    button.addEventListener("click", onClick);
    actions.appendChild(button);
    return button;
  };

  add("New game", () => {
    cancelThinking();
    state.screen = "setup";
    state.game = null;
    render();
  });
  if (!gameOver(game)) {
    add("Resign", () => openResignDialog(game), true);
  }
  add("Export game", () => openExportDialog(game));
  add("Import game", openImportDialog);
  add(soundEnabled() ? "Sound on" : "Sound off", () => {
    setSoundEnabled(!soundEnabled());
    render();
  });
  return actions;
};

/* ------------------------------------------------------------------ */
/* Dialogs                                                            */
/* ------------------------------------------------------------------ */

const openDialog = (build: (dialog: HTMLDialogElement) => void): HTMLDialogElement => {
  const dialog = document.createElement("dialog");
  build(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  document.body.appendChild(dialog);
  dialog.showModal();
  return dialog;
};

const openPromotionDialog = (game: Game, promotions: number[]): void => {
  openDialog((dialog) => {
    const heading = document.createElement("h2");
    heading.textContent = "Promote to";
    dialog.appendChild(heading);
    const row = document.createElement("div");
    row.className = "promo-choices";
    for (const move of promotions) {
      const type = movePromo(move);
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", `Promote to ${PIECE_NAMES[type] ?? ""}`);
      button.innerHTML = pieceSvg(type, playerIndex(game));
      button.addEventListener("click", () => {
        dialog.close();
        playPlayerMove(game, move);
      });
      row.appendChild(button);
    }
    dialog.appendChild(row);
  });
};

const openResignDialog = (game: Game): void => {
  openDialog((dialog) => {
    dialog.innerHTML = `<h2>Resign this game?</h2>`;
    const row = document.createElement("div");
    row.className = "dialog-row";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Keep playing";
    cancel.addEventListener("click", () => dialog.close());
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "primary";
    confirm.textContent = "Resign";
    confirm.addEventListener("click", () => {
      dialog.close();
      cancelThinking();
      game.resigned = true;
      playGameEnd(false);
      render();
    });
    row.append(cancel, confirm);
    dialog.appendChild(row);
  });
};

const showToast = (text: string): void => {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = text;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  window.setTimeout(() => {
    toast.classList.remove("show");
    window.setTimeout(() => toast.remove(), 400);
  }, 1600);
};

const openExportDialog = (game: Game): void => {
  const json = JSON.stringify(exportState(game), null, 2);
  openDialog((dialog) => {
    dialog.innerHTML = `<h2>Export game</h2>`;
    const text = document.createElement("textarea");
    text.className = "import-text";
    text.readOnly = true;
    text.value = json;
    dialog.appendChild(text);
    const row = document.createElement("div");
    row.className = "dialog-row";

    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy";
    copy.addEventListener("click", () => {
      const done = (): void => showToast("Copied to clipboard");
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(json).then(done, () => {
          text.select();
          document.execCommand("copy");
          done();
        });
      } else {
        text.select();
        document.execCommand("copy");
        done();
      }
    });

    const download = document.createElement("button");
    download.type = "button";
    download.className = "primary";
    download.textContent = "Download .json";
    download.addEventListener("click", () => {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "fable-chess-game.json";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    });

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.addEventListener("click", () => dialog.close());

    row.append(close, copy, download);
    dialog.appendChild(row);
  });
};

const loadStateIntoGame = (value: unknown): void => {
  const game = importState(value);
  startGame(game);
};

const openImportDialog = (): void => {
  openDialog((dialog) => {
    dialog.innerHTML = `<h2>Import game</h2>`;
    const text = document.createElement("textarea");
    text.className = "import-text";
    text.placeholder = "Paste a saved game here…";
    dialog.appendChild(text);

    const fileRow = document.createElement("p");
    fileRow.className = "file-row";
    fileRow.textContent = "Or choose a file: ";
    const file = document.createElement("input");
    file.type = "file";
    file.accept = ".json,application/json";
    file.addEventListener("change", () => {
      const chosen = file.files?.[0];
      if (!chosen) return;
      void chosen.text().then((content) => {
        text.value = content;
      });
    });
    fileRow.appendChild(file);
    dialog.appendChild(fileRow);

    const error = document.createElement("p");
    error.className = "import-error";
    dialog.appendChild(error);

    const row = document.createElement("div");
    row.className = "dialog-row";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => dialog.close());
    const load = document.createElement("button");
    load.type = "button";
    load.className = "primary";
    load.textContent = "Load game";
    load.addEventListener("click", () => {
      try {
        const parsed: unknown = JSON.parse(text.value);
        loadStateIntoGame(parsed);
        dialog.close();
      } catch (cause) {
        error.textContent =
          cause instanceof SyntaxError
            ? "That is not valid JSON."
            : cause instanceof Error
              ? cause.message
              : "Could not load that game.";
      }
    });
    row.append(cancel, load);
    dialog.appendChild(row);
  });
};

/* ------------------------------------------------------------------ */
/* Bridge and boot                                                    */
/* ------------------------------------------------------------------ */

initBridge({
  getState: () => (state.game ? exportState(state.game) : null),
  getSummary: () => (state.game ? gameSummary(state.game) : null),
  loadState: (value) => {
    loadStateIntoGame(value);
  }
});

render();
