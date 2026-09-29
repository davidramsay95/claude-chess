import { NO_SQUARE, PIECE_LETTERS, WHITE, BLACK, KING, makePiece, opposite, type Color } from "../engine/types";
import type { Difficulty } from "../engine/search";
import { Board } from "./board";
import type { Game, GameOver } from "./game";
import { pieceSvg } from "./pieces";

interface LevelOption {
  value: Difficulty;
  label: string;
  blurb: string;
}

const LEVELS: readonly LevelOption[] = [
  { value: "easy", label: "Easy", blurb: "Answers at once and overlooks plenty." },
  { value: "medium", label: "Medium", blurb: "Sees a few moves ahead. A fair club game." },
  { value: "hard", label: "Hard", blurb: "Searches deeper and punishes loose play." },
  { value: "expert", label: "Expert", blurb: "Thinks longest and plays its strongest chess." },
];

const PIECE_VALUES = [0, 1, 3, 3, 5, 9, 0];

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const button = (label: string, className: string, onClick: () => void): HTMLButtonElement => {
  const node = el("button", className, label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
};

const colorName = (color: Color): string => (color === WHITE ? "White" : "Black");

const describeGameOver = (over: GameOver, player: Color): { headline: string; detail: string } => {
  const playerWon = over.winner === player;
  const result = over.winner === undefined ? "½–½" : over.winner === WHITE ? "1–0" : "0–1";
  switch (over.reason) {
    case "checkmate":
      return {
        headline: playerWon ? "Checkmate. You win." : "Checkmate.",
        detail: `${colorName(over.winner ?? WHITE)} mates. ${result}`,
      };
    case "resigned":
      return { headline: "You resigned.", detail: `${colorName(over.winner ?? WHITE)} wins. ${result}` };
    case "stalemate":
      return { headline: "Stalemate.", detail: `No legal moves, no check. ${result}` };
    case "insufficient":
      return { headline: "Drawn.", detail: `Neither side can force mate. ${result}` };
    case "fifty-move":
      return { headline: "Drawn.", detail: `Fifty moves without capture or pawn move. ${result}` };
    case "repetition":
      return { headline: "Drawn.", detail: `Threefold repetition. ${result}` };
    default:
      return { headline: "Game over.", detail: result };
  }
};

export interface MountedApp {
  /** Switches from the start screen to the board for a game that was started programmatically, e.g. restored. */
  revealGame(): void;
}

/** Mounts the start screen and game view into `container` and keeps them in sync with `game`. */
export const mountApp = (container: HTMLElement, game: Game): MountedApp => {
  let orientation: Color = WHITE;
  let confirmingResign = false;
  let chosenColor: Color = WHITE;
  let chosenLevel: Difficulty = "medium";

  const app = el("div", "app");
  const start = el("section", "start");
  const gameView = el("main", "game");
  gameView.hidden = true;
  app.append(start, gameView);

  // Start screen -------------------------------------------------------------------------

  const masthead = el("header", "start__masthead");
  masthead.append(el("h1", "start__title", "Chess"));
  masthead.append(el("p", "start__lede", "One board, one opponent, no clock. Choose a side and how hard it fights back."));

  const sideField = el("fieldset", "sides");
  sideField.append(el("legend", "field__legend", "Play as"));
  const sideButtons = new Map<Color, HTMLButtonElement>();
  for (const color of [WHITE, BLACK] as const) {
    const choice = button("", "side", () => {
      chosenColor = color;
      syncStartChoices();
    });
    choice.setAttribute("aria-pressed", "false");
    const figure = el("span", "side__piece");
    figure.innerHTML = pieceSvg(makePiece(KING, color));
    const caption = el("span", "side__label", colorName(color));
    const note = el("span", "side__note", color === WHITE ? "You move first" : "The engine opens");
    choice.append(figure, caption, note);
    sideButtons.set(color, choice);
    sideField.append(choice);
  }

  const levelField = el("fieldset", "levels");
  levelField.append(el("legend", "field__legend", "Strength"));
  const levelButtons = new Map<Difficulty, HTMLButtonElement>();
  LEVELS.forEach((level, index) => {
    const choice = button("", "level", () => {
      chosenLevel = level.value;
      syncStartChoices();
    });
    choice.setAttribute("aria-pressed", "false");
    choice.append(
      el("span", "level__index", String(index + 1).padStart(2, "0")),
      el("span", "level__label", level.label),
      el("span", "level__blurb", level.blurb),
    );
    levelButtons.set(level.value, choice);
    levelField.append(choice);
  });

  const begin = button("Begin", "btn btn--primary start__begin", () => {
    orientation = chosenColor;
    confirmingResign = false;
    game.newGame(chosenColor, chosenLevel);
    showGame();
  });

  start.append(masthead, sideField, levelField, begin);

  const syncStartChoices = (): void => {
    for (const [color, node] of sideButtons) node.setAttribute("aria-pressed", String(color === chosenColor));
    for (const [level, node] of levelButtons) node.setAttribute("aria-pressed", String(level === chosenLevel));
  };
  syncStartChoices();

  // Game view -----------------------------------------------------------------------------

  const boardColumn = el("div", "game__board");
  const board = new Board(boardColumn, {
    onMove: (from, to, promotion) => game.playerMove(from, to, promotion),
  });

  const panel = el("aside", "panel");
  const status = el("div", "status");
  const statusHeadline = el("h2", "status__headline");
  const statusDetail = el("p", "status__detail");
  const statusLive = el("p", "status__live");
  statusLive.setAttribute("aria-live", "polite");
  status.append(statusHeadline, statusDetail, statusLive);

  const captures = el("div", "captures");
  const captureRows = new Map<Color, HTMLElement>();
  for (const color of [WHITE, BLACK] as const) {
    const row = el("div", "captures__row");
    row.dataset.side = colorName(color).toLowerCase();
    captureRows.set(color, row);
    captures.append(row);
  }

  const movesHeading = el("h3", "moves__heading", "Moves");
  const moveList = el("ol", "moves");
  moveList.setAttribute("aria-label", "Move list");
  const movesEmpty = el("p", "moves__empty", "No moves yet.");
  const movesWrap = el("div", "moves__wrap");
  movesWrap.append(movesHeading, movesEmpty, moveList);

  const actions = el("div", "actions");
  const undoButton = button("Undo", "btn", () => {
    board.clearSelection();
    game.undo();
  });
  const flipButton = button("Flip", "btn", () => {
    orientation = opposite(orientation);
    render();
  });
  const resignButton = button("Resign", "btn btn--danger", () => {
    confirmingResign = true;
    render();
  });
  const newGameButton = button("New game", "btn btn--ghost", () => {
    board.clearSelection();
    confirmingResign = false;
    showStart();
  });
  const resignConfirm = el("div", "confirm");
  resignConfirm.setAttribute("role", "group");
  resignConfirm.setAttribute("aria-label", "Confirm resignation");
  const resignYes = button("Yes, resign", "btn btn--danger", () => {
    confirmingResign = false;
    board.clearSelection();
    game.resign();
  });
  const resignNo = button("Keep playing", "btn", () => {
    confirmingResign = false;
    render();
    resignButton.focus();
  });
  resignConfirm.append(el("span", "confirm__text", "Resign this game?"), resignYes, resignNo);
  actions.append(undoButton, flipButton, resignButton, newGameButton, resignConfirm);

  panel.append(status, captures, movesWrap, actions);
  gameView.append(boardColumn, panel);

  const showStart = (): void => {
    gameView.hidden = true;
    start.hidden = false;
    sideButtons.get(chosenColor)?.focus();
  };

  const showGame = (): void => {
    start.hidden = true;
    gameView.hidden = false;
    render();
  };

  const renderStatus = (): void => {
    const over = game.gameOver();
    status.classList.toggle("status--check", false);
    status.classList.toggle("status--thinking", false);
    status.classList.toggle("status--over", false);
    if (over !== null) {
      const { headline, detail } = describeGameOver(over, game.playerColor);
      statusHeadline.textContent = headline;
      statusDetail.textContent = detail;
      statusLive.textContent = `${headline} ${detail}`;
      status.classList.add("status--over");
      return;
    }
    const error = game.engineError;
    if (error !== null) {
      statusHeadline.textContent = "The engine stumbled.";
      statusDetail.textContent = error;
      statusLive.textContent = `Engine error: ${error}`;
      return;
    }
    const inCheck = game.position.inCheck();
    const toMove = game.position.turn;
    if (game.isThinking) {
      statusHeadline.textContent = inCheck ? "Check. Thinking…" : "Thinking…";
      statusDetail.textContent = `${colorName(toMove)} is searching for a reply.`;
      status.classList.add("status--thinking");
    } else {
      statusHeadline.textContent = inCheck ? "Check!" : `${colorName(toMove)} to move.`;
      statusDetail.textContent = toMove === game.playerColor ? "Your move." : `${colorName(toMove)} to move.`;
    }
    if (inCheck) status.classList.add("status--check");
    statusLive.textContent = `${statusHeadline.textContent} ${statusDetail.textContent}`;
  };

  const renderCaptures = (): void => {
    const material = [0, 0];
    for (const color of [WHITE, BLACK] as const) {
      for (const type of game.captured[color]) material[color] += PIECE_VALUES[type];
    }
    for (const color of [WHITE, BLACK] as const) {
      const row = captureRows.get(color);
      if (row === undefined) continue;
      row.replaceChildren();
      const label = el("span", "captures__label", `${colorName(color)} took`);
      row.append(label);
      const pieces = el("span", "captures__pieces");
      const taken = [...game.captured[color]].sort((a, b) => b - a);
      for (const type of taken) {
        const piece = el("span", "captures__piece");
        piece.innerHTML = pieceSvg(makePiece(type, opposite(color)));
        piece.setAttribute("aria-label", PIECE_LETTERS[type]);
        pieces.append(piece);
      }
      row.append(pieces);
      const lead = material[color] - material[opposite(color)];
      if (lead > 0) row.append(el("span", "captures__lead", `+${lead}`));
      row.classList.toggle("captures__row--empty", taken.length === 0);
    }
  };

  const renderMoves = (): void => {
    const sans = game.sans;
    movesEmpty.hidden = sans.length > 0;
    moveList.replaceChildren();
    for (let i = 0; i < sans.length; i += 2) {
      const item = el("li", "moves__pair");
      item.append(el("span", "moves__number", `${i / 2 + 1}.`));
      const white = el("span", "moves__san", sans[i]);
      const black = el("span", "moves__san", sans[i + 1] ?? "");
      if (sans[i + 1] === undefined && game.gameOver() === null) black.classList.add("moves__san--pending");
      const latest = i + 1 === sans.length ? white : black;
      if (i + 2 >= sans.length) latest.classList.add("moves__san--latest");
      item.append(white, black);
      moveList.append(item);
    }
    moveList.scrollTop = moveList.scrollHeight;
  };

  const renderActions = (): void => {
    const over = game.gameOver() !== null;
    undoButton.disabled = game.isThinking || game.moves.length === 0 || over;
    resignButton.disabled = over || game.isThinking;
    resignButton.hidden = confirmingResign;
    resignConfirm.hidden = !confirmingResign;
    if (confirmingResign) resignYes.focus();
  };

  const render = (): void => {
    if (gameView.hidden) return;
    const pos = game.position;
    board.render({
      pieceAt: (sq) => pos.pieceAt(sq),
      legalMovesFrom: (sq) => game.legalMovesFrom(sq),
      lastMove: pos.lastMove(),
      checkSquare: pos.inCheck() ? pos.kingSquare(pos.turn) : NO_SQUARE,
      orientation,
      interactive: game.isPlayersTurn(),
    });
    renderStatus();
    renderCaptures();
    renderMoves();
    renderActions();
  };

  game.onChange(render);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      board.clearSelection();
      if (confirmingResign) {
        confirmingResign = false;
        render();
      }
    }
  });

  container.replaceChildren(app);

  return {
    revealGame: () => {
      board.clearSelection();
      confirmingResign = false;
      orientation = game.playerColor;
      showGame();
    },
  };
};
