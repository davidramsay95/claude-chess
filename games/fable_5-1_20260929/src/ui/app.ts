import { createEngineClient } from "../engine/engineClient";
import { type ColorName, Game, type GameStatus, colorFromName, colorName } from "../engine/game";
import { type Move, moveCaptured, movePromotion, moveTo } from "../engine/move";
import type { Position } from "../engine/position";
import { type Difficulty, isDifficulty } from "../engine/protocol";
import { BLACK, KING, WHITE, pieceOf } from "../engine/types";
import { exportGameState, importGameState, serializeGameState, summaryOf } from "../state/gameState";
import type { GameSummary, LiveGame, SavedGameState } from "../state/contracts";
import { createBoard } from "./board";
import { createExportDialog, createImportDialog, createPromotionPicker } from "./dialogs";
import { createMoveList } from "./moveList";
import { pieceSvg } from "./pieces";
import { createSounds } from "./sounds";

export interface App {
  /** Current export for the save bridge; nulls before a game has started. */
  getState(): { state: SavedGameState | null; summary: GameSummary | null };
  /** Shared by the import dialog and the bridge. Leaves the current game untouched on failure. */
  loadFromState(input: unknown): { ok: true } | { ok: false; error: string };
}

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  expert: "Expert",
};

const required = <T extends Element>(root: ParentNode, selector: string): T => {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};

const capitalise = (name: ColorName): string => (name === "white" ? "White" : "Black");

const describeStatus = (status: GameStatus, game: Game, playerColor: ColorName, thinking: boolean): string => {
  const mover = colorName(game.turn());
  switch (status.kind) {
    case "checkmate":
      return `Checkmate. ${capitalise(status.winner ?? "white")} wins${status.winner === playerColor ? ", well played!" : "."}`;
    case "stalemate":
      return "Stalemate. Draw.";
    case "repetition":
      return "Draw by threefold repetition.";
    case "fifty-move":
      return "Draw by the fifty-move rule.";
    case "insufficient-material":
      return "Draw. Insufficient material to mate.";
    case "resigned":
      return `${capitalise(status.winner === "white" ? "black" : "white")} resigned. ${capitalise(status.winner ?? "white")} wins.`;
    case "playing": {
      const prefix = status.inCheck ? "Check! " : "";
      if (mover === playerColor) return `${prefix}Your move (${capitalise(mover)}).`;
      return thinking ? `${prefix}Engine is thinking as ${capitalise(mover)}.` : `${prefix}${capitalise(mover)} to move.`;
    }
    default:
      return "";
  }
};

/** Wires the DOM in index.html to the game, the engine worker and the save format. */
export const createApp = (root: HTMLElement): App => {
  const setupScreen = required<HTMLElement>(root, "#setup");
  const gameScreen = required<HTMLElement>(root, "#game");
  const boardElement = required<HTMLElement>(root, "#board");
  const promotionElement = required<HTMLElement>(root, "#promotion");
  const thinkingElement = required<HTMLElement>(root, "#thinking");
  const statusElement = required<HTMLElement>(root, "#status");
  const metaElement = required<HTMLElement>(root, "#meta");
  const movesElement = required<HTMLElement>(root, "#moves");
  const resignConfirm = required<HTMLElement>(root, "#resign-confirm");
  const exportDialogElement = required<HTMLDialogElement>(root, "#export-dialog");
  const importDialogElement = required<HTMLDialogElement>(root, "#import-dialog");
  const button = (action: string): HTMLButtonElement => required<HTMLButtonElement>(root, `[data-action="${action}"]`);
  const gameButtons = (action: string): HTMLButtonElement[] =>
    Array.from(gameScreen.querySelectorAll<HTMLButtonElement>(`[data-action="${action}"]`));

  for (const icon of root.querySelectorAll<HTMLElement>("[data-piece]")) {
    icon.innerHTML = pieceSvg(icon.dataset.piece === "black-king" ? pieceOf(KING, BLACK) : pieceOf(KING, WHITE));
  }

  const engine = createEngineClient();
  const sounds = createSounds();

  let live: LiveGame | null = null;
  /** Bumped whenever the live game is replaced so stale engine replies are dropped. */
  let gameToken = 0;
  let thinking = false;
  /** Half-moves shown on the board while browsing, or null for the live position. */
  let viewPly: number | null = null;
  let flipped = false;
  let selected: number | null = null;

  const playerColorCode = (): number => (live ? colorFromName(live.playerColor) : WHITE);

  const shownPly = (): number => (live ? (viewPly ?? live.game.plyCount()) : 0);

  const shownPosition = (): Position | null => {
    if (!live) return null;
    return viewPly === null ? live.game.position : live.game.positionAt(viewPly);
  };

  const isPlayersTurn = (): boolean => live !== null && live.game.turn() === playerColorCode();

  const boardInteractive = (): boolean =>
    live !== null && viewPly === null && !thinking && !live.game.isOver() && isPlayersTurn();

  const moveList = createMoveList(movesElement, (ply: number): void => selectPly(ply));
  const promotionPicker = createPromotionPicker(promotionElement);

  const render = (): void => {
    setupScreen.hidden = live !== null;
    gameScreen.hidden = live === null;
    if (!live) return;
    const position = shownPosition();
    if (!position) return;
    const ply = shownPly();
    const history = live.game.moveHistory();
    const lastMove: Move | null = ply > 0 ? (history[ply - 1] ?? null) : null;
    const targets = selected !== null && boardInteractive() ? live.game.legalMovesFrom(selected) : [];
    board.render({
      position,
      flipped,
      selected,
      targets,
      lastMove,
      checkSquare: position.inCheck() ? position.kingOf(position.sideToMove) : null,
      interactive: boardInteractive(),
    });
    const status = live.game.status();
    statusElement.textContent = describeStatus(status, live.game, live.playerColor, thinking);
    statusElement.classList.toggle("over", status.kind !== "playing");
    const browsing = viewPly !== null && viewPly !== live.game.plyCount();
    metaElement.textContent = `You play ${capitalise(live.playerColor)} · ${DIFFICULTY_LABELS[live.difficulty]}${
      browsing ? ` · viewing move ${ply} of ${live.game.plyCount()}` : ""
    }`;
    thinkingElement.hidden = !thinking;
    moveList.render(live.game.sanHistory(), ply);
    const total = live.game.plyCount();
    button("first").disabled = ply === 0;
    button("prev").disabled = ply === 0;
    button("next").disabled = ply >= total;
    button("last").disabled = ply >= total;
    button("live").hidden = !browsing;
    button("takeback").disabled = thinking || total === 0;
    button("resign").disabled = live.game.isOver();
    for (const importButton of gameButtons("import")) importButton.disabled = thinking;
  };

  const announceMove = (move: Move): void => {
    if (!live) return;
    const status = live.game.status();
    if (status.kind !== "playing") sounds.play("end");
    else if (status.inCheck) sounds.play("check");
    else sounds.play(moveCaptured(move) ? "capture" : "move");
  };

  const maybeEngineMove = (): void => {
    if (!live || thinking || live.game.isOver() || isPlayersTurn()) return;
    const token = gameToken;
    const game = live.game;
    thinking = true;
    render();
    engine
      .search({ startFen: game.startFen, moves: game.uciHistory(), difficulty: live.difficulty })
      .then(
        (response): void => {
          if (token !== gameToken) return;
          thinking = false;
          const move = response.uci === null ? null : game.findUci(response.uci);
          if (move !== null) {
            game.playMove(move);
            viewPly = null;
            selected = null;
            announceMove(move);
          } else if (!game.isOver()) {
            console.error("Engine returned no playable move", response);
          }
          render();
        },
        (error: unknown): void => {
          if (token !== gameToken) return;
          thinking = false;
          if (!(error instanceof Error && error.message === "cancelled")) console.error(error);
          render();
        },
      );
  };

  const installLive = (next: LiveGame): void => {
    gameToken++;
    thinking = false;
    live = next;
    flipped = next.playerColor === "black";
    viewPly = null;
    selected = null;
    promotionPicker.hide();
    resignConfirm.hidden = true;
    render();
    maybeEngineMove();
  };

  const playPlayerMove = (move: Move): void => {
    if (!live) return;
    live.game.playMove(move);
    selected = null;
    viewPly = null;
    announceMove(move);
    render();
    maybeEngineMove();
  };

  /** Plays the move from `from` to `to` if legal, asking for a promotion piece when needed. */
  const tryMove = (from: number, to: number): boolean => {
    if (!live || !boardInteractive()) return false;
    const candidates = live.game.legalMovesFrom(from).filter((move) => moveTo(move) === to);
    if (candidates.length === 0) return false;
    if (candidates.length === 1 && movePromotion(candidates[0] as Move) === 0) {
      playPlayerMove(candidates[0] as Move);
      return true;
    }
    const token = gameToken;
    selected = from;
    render();
    void promotionPicker.choose(playerColorCode()).then((type): void => {
      if (token !== gameToken || !live) return;
      const chosen = type === null ? undefined : candidates.find((move) => movePromotion(move) === type);
      if (chosen === undefined) {
        selected = null;
        render();
        return;
      }
      playPlayerMove(chosen);
    });
    return true;
  };

  const board = createBoard(boardElement, {
    onSquareClick: (square: number): void => {
      if (!live || !boardInteractive()) return;
      if (selected !== null && selected !== square && tryMove(selected, square)) return;
      const ownPiece = live.game.legalMovesFrom(square).length > 0;
      selected = ownPiece && selected !== square ? square : null;
      render();
    },
    onDrop: (from: number, to: number): void => {
      if (!tryMove(from, to)) {
        selected = null;
        render();
      }
    },
  });

  const selectPly = (ply: number): void => {
    if (!live) return;
    const clamped = Math.max(0, Math.min(ply, live.game.plyCount()));
    viewPly = clamped === live.game.plyCount() ? null : clamped;
    selected = null;
    render();
  };

  const showSetup = (): void => {
    gameToken++;
    thinking = false;
    live = null;
    promotionPicker.hide();
    render();
  };

  const startGame = (): void => {
    const colorInput = setupScreen.querySelector<HTMLInputElement>("input[name=color]:checked");
    const difficultyInput = setupScreen.querySelector<HTMLInputElement>("input[name=difficulty]:checked");
    const playerColor: ColorName = colorInput?.value === "black" ? "black" : "white";
    const difficulty: Difficulty = isDifficulty(difficultyInput?.value) ? difficultyInput.value : "medium";
    installLive({ game: Game.fromStart(), playerColor, difficulty });
  };

  const takeBack = (): void => {
    if (!live || thinking || live.game.plyCount() === 0) return;
    const game = live.game;
    game.undo();
    while (game.plyCount() > 0 && game.turn() !== playerColorCode()) game.undo();
    viewPly = null;
    selected = null;
    resignConfirm.hidden = true;
    render();
    maybeEngineMove();
  };

  const resign = (): void => {
    if (!live || live.game.isOver()) return;
    gameToken++;
    thinking = false;
    live.game.resign(live.playerColor);
    resignConfirm.hidden = true;
    selected = null;
    sounds.play("end");
    render();
  };

  const loadFromState = (input: unknown): { ok: true } | { ok: false; error: string } => {
    const result = importGameState(input);
    if (!result.ok) return { ok: false, error: result.error };
    installLive(result.value);
    return { ok: true };
  };

  const getState = (): { state: SavedGameState | null; summary: GameSummary | null } => {
    if (!live) return { state: null, summary: null };
    return { state: exportGameState(live), summary: summaryOf(live.game) };
  };

  const exportDialog = createExportDialog(exportDialogElement);
  const importDialog = createImportDialog(importDialogElement, (text: string): string | null => {
    const result = loadFromState(text);
    return result.ok ? null : result.error;
  });

  button("start").addEventListener("click", startGame);
  for (const importButton of root.querySelectorAll<HTMLButtonElement>('[data-action="import"]')) {
    importButton.addEventListener("click", (): void => importDialog.open());
  }
  button("export").addEventListener("click", (): void => {
    if (!live) return;
    const date = new Date().toISOString().slice(0, 10);
    exportDialog.open(serializeGameState(exportGameState(live)), `fable-chess-${date}.json`);
  });
  button("new").addEventListener("click", showSetup);
  button("resign").addEventListener("click", (): void => {
    resignConfirm.hidden = false;
  });
  button("resign-yes").addEventListener("click", resign);
  button("resign-no").addEventListener("click", (): void => {
    resignConfirm.hidden = true;
  });
  button("takeback").addEventListener("click", takeBack);
  button("flip").addEventListener("click", (): void => {
    flipped = !flipped;
    render();
  });
  const soundButton = button("sound");
  soundButton.addEventListener("click", (): void => {
    const muted = !sounds.isMuted();
    sounds.setMuted(muted);
    soundButton.textContent = muted ? "Sound off" : "Sound on";
    soundButton.setAttribute("aria-pressed", String(!muted));
  });
  button("first").addEventListener("click", (): void => selectPly(0));
  button("prev").addEventListener("click", (): void => selectPly(shownPly() - 1));
  button("next").addEventListener("click", (): void => selectPly(shownPly() + 1));
  button("last").addEventListener("click", (): void => selectPly(live?.game.plyCount() ?? 0));
  button("live").addEventListener("click", (): void => selectPly(live?.game.plyCount() ?? 0));

  document.addEventListener("keydown", (event: KeyboardEvent): void => {
    if (!live || exportDialogElement.open || importDialogElement.open) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;
    if (event.key === "ArrowLeft") {
      selectPly(shownPly() - 1);
      event.preventDefault();
    } else if (event.key === "ArrowRight") {
      selectPly(shownPly() + 1);
      event.preventDefault();
    } else if (event.key === "Escape" && selected !== null) {
      selected = null;
      render();
    }
  });

  render();
  return { getState, loadFromState };
};
