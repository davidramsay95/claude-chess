import type { EngineClient } from '../engine/engineClient';
import { type Color, KNIGHT, BISHOP, ROOK, QUEEN, WHITE, pieceColor } from '../engine/types';
import { BoardView } from './boardView';
import { GameController, type GameSnapshot } from './controller';
import { button, el } from './dom';
import { describeResult } from './gameResult';
import { computeMaterial } from './material';
import { kindName, pieceSvg } from './pieces';
import { loadSettings, levelLabel, resolveSide, saveSettings, type Settings } from './settings';
import { PlayerBar, SidePanel } from './sidePanel';
import { SetupDialog } from './setupDialog';

const PROMOTION_KINDS = [QUEEN, ROOK, BISHOP, KNIGHT];

/** Wires the controller to the board, panel, overlays and setup dialog. */
export class App {
  private readonly controller: GameController;
  private readonly board: BoardView;
  private readonly panel: SidePanel;
  private readonly topBar = new PlayerBar();
  private readonly bottomBar = new PlayerBar();
  private readonly overlay = el('div', 'overlay');
  private readonly toast = el('div', 'toast');
  private readonly live = el('div', 'sr-only');
  private readonly setup: SetupDialog;
  private flipped = false;
  private dismissedResult: GameSnapshot['result'] = null;
  private lastAnnouncementId = 0;

  constructor(root: HTMLElement, engine: EngineClient) {
    this.controller = new GameController(engine);

    const boardEl = el('div', 'board');
    boardEl.setAttribute('role', 'group');
    boardEl.setAttribute('aria-label', 'Chess board');
    this.board = new BoardView(boardEl, {
      canPickUp: (square) => {
        const piece = this.controller.getSnapshot().board[square];
        return piece !== 0 && pieceColor(piece) === this.controller.getSnapshot().playerColor;
      },
      select: (square) => this.controller.select(square),
      tap: (square) => this.controller.tap(square),
      drop: (from, to) => this.controller.drop(from, to),
    });

    this.panel = new SidePanel(
      {
        newGame: () => this.openSetup(),
        undo: () => this.controller.undo(),
        resign: () => this.controller.resign(),
        flip: () => {
          this.flipped = !this.flipped;
          this.render(this.controller.getSnapshot());
        },
      },
      () => this.controller.resign(),
    );

    const boardWrap = el('div', 'board-wrap');
    boardWrap.append(boardEl, this.overlay, this.toast);
    const boardCol = el('section', 'board-col');
    boardCol.append(this.topBar.element, boardWrap, this.bottomBar.element);

    const header = el('header', 'masthead');
    header.append(el('h1', 'wordmark', 'Chess'), el('span', 'tagline', 'A quiet game against the machine'));

    const layout = el('main', 'app');
    layout.append(header, boardCol, this.panel.element);
    this.live.setAttribute('aria-live', 'polite');
    this.live.setAttribute('role', 'log');
    root.append(layout, this.live);

    this.setup = new SetupDialog(loadSettings(this.storage()), (settings) => this.startGame(settings));
    this.controller.subscribe((snapshot) => this.render(snapshot));
    this.render(this.controller.getSnapshot());
    this.setup.open(false);
  }

  /** Exposed for the dev-only debug hook. */
  get debugController(): GameController {
    return this.controller;
  }

  private storage(): Storage {
    try {
      return window.localStorage;
    } catch {
      // Blocked storage (privacy modes) falls back to an inert stand-in.
      return { getItem: () => null, setItem: () => undefined } as unknown as Storage;
    }
  }

  private openSetup(): void {
    this.setup.open(this.controller.getSnapshot().active);
  }

  private startGame(settings: Settings): void {
    saveSettings(this.storage(), settings);
    const playerColor = resolveSide(settings.side, Math.random);
    this.flipped = false;
    this.dismissedResult = null;
    this.controller.start({ playerColor, level: settings.level });
  }

  private orientation(snapshot: GameSnapshot): Color {
    const base = snapshot.playerColor;
    return this.flipped ? ((base ^ 1) as Color) : base;
  }

  private render(snapshot: GameSnapshot): void {
    const orientation = this.orientation(snapshot);
    this.board.render(snapshot, orientation);
    this.renderBars(snapshot, orientation);
    this.panel.update(snapshot);
    this.renderOverlay(snapshot);
    this.renderToast(snapshot);
    if (snapshot.announcementId !== this.lastAnnouncementId) {
      this.lastAnnouncementId = snapshot.announcementId;
      this.live.textContent = snapshot.announcement;
    }
  }

  private renderBars(snapshot: GameSnapshot, orientation: Color): void {
    const material = computeMaterial(snapshot.board);
    const bottom = orientation;
    const top = (orientation ^ 1) as Color;
    const fill = (bar: PlayerBar, color: Color): void => {
      bar.update({
        color,
        isPlayer: color === snapshot.playerColor,
        level: levelLabel(snapshot.level),
        capturedKinds: color === WHITE ? material.capturedByWhite : material.capturedByBlack,
        balance: material.balance,
        toMove: snapshot.active && !snapshot.result && snapshot.turn === color,
        thinking: snapshot.thinking,
      });
    };
    fill(this.topBar, top);
    fill(this.bottomBar, bottom);
  }

  private renderOverlay(snapshot: GameSnapshot): void {
    this.overlay.textContent = '';
    if (snapshot.pendingPromotion) {
      this.overlay.className = 'overlay is-open';
      this.overlay.append(this.buildPromotionPicker(snapshot.playerColor));
      return;
    }
    if (snapshot.result && snapshot.result !== this.dismissedResult) {
      const description = describeResult(snapshot.result, snapshot.playerColor);
      this.overlay.className = `overlay is-open tone-${description.tone}`;
      const card = el('div', 'result-card');
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-label', 'Game over');
      const actions = el('div', 'result-actions');
      const newGame = button('New game', 'btn btn-primary', () => this.openSetup());
      actions.append(
        newGame,
        button('View board', 'btn', () => {
          this.dismissedResult = snapshot.result;
          this.render(this.controller.getSnapshot());
        }),
      );
      card.append(el('p', 'eyebrow', 'Game over'), el('h2', 'result-title', description.title), el('p', 'result-detail', description.detail), actions);
      this.overlay.append(card);
      return;
    }
    this.overlay.className = 'overlay';
  }

  private buildPromotionPicker(color: Color): HTMLElement {
    const card = el('div', 'promo-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Choose promotion piece');
    card.append(el('p', 'eyebrow', 'Promote pawn to'));
    const row = el('div', 'promo-row');
    for (const kind of PROMOTION_KINDS) {
      const choice = button('', 'promo-choice', () => this.controller.choosePromotion(kind));
      choice.setAttribute('aria-label', kindName(kind));
      choice.title = kindName(kind);
      choice.innerHTML = pieceSvg(kind, color);
      row.append(choice);
    }
    card.append(row, button('Cancel', 'btn btn-quiet', () => this.controller.choosePromotion(null)));
    queueMicrotask(() => row.querySelector('button')?.focus());
    return card;
  }

  private renderToast(snapshot: GameSnapshot): void {
    this.toast.textContent = '';
    this.toast.classList.toggle('is-open', snapshot.error !== null);
    if (snapshot.error === null) return;
    this.toast.setAttribute('role', 'alert');
    this.toast.append(
      el('span', 'toast-text', `The computer could not move. ${snapshot.error}`),
      button('Retry', 'btn btn-small', () => this.controller.retry()),
    );
  }
}
