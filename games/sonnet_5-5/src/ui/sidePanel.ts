import { BLACK, type Color, WHITE } from '../engine/types';
import { button, el } from './dom';
import { describeResult } from './gameResult';
import type { GameSnapshot } from './controller';
import { formatAdvantage } from './material';
import { pairMoves } from './moveList';
import { pieceSvg } from './pieces';
import { levelLabel } from './settings';

export interface PanelActions {
  newGame: () => void;
  undo: () => void;
  resign: () => void;
  flip: () => void;
}

/** One player row above or below the board: name, captured pieces and material lead. */
export class PlayerBar {
  readonly element = el('div', 'player-bar');
  private readonly badge = el('span', 'badge');
  private readonly name = el('span', 'player-name');
  private readonly sub = el('span', 'player-sub');
  private readonly captured = el('span', 'captured');
  private readonly advantage = el('span', 'advantage');

  constructor() {
    const text = el('span', 'player-text');
    text.append(this.name, this.sub);
    const trailing = el('span', 'player-trailing');
    trailing.append(this.captured, this.advantage);
    this.element.append(this.badge, text, trailing);
  }

  update(options: {
    color: Color;
    isPlayer: boolean;
    level: string;
    capturedKinds: number[];
    balance: number;
    toMove: boolean;
    thinking: boolean;
  }): void {
    const { color } = options;
    this.badge.className = `badge badge-${color === WHITE ? 'white' : 'black'}`;
    this.badge.innerHTML = pieceSvg(6, color);
    this.name.textContent = options.isPlayer ? 'You' : 'Computer';
    this.sub.textContent = options.isPlayer
      ? color === WHITE ? 'White' : 'Black'
      : `${color === WHITE ? 'White' : 'Black'} · ${options.level}`;
    this.element.classList.toggle('to-move', options.toMove);
    this.element.classList.toggle('is-thinking', options.toMove && options.thinking);
    const opposite: Color = color === WHITE ? BLACK : WHITE;
    this.captured.innerHTML = options.capturedKinds
      .map((kind) => `<span class="mini">${pieceSvg(kind, opposite)}</span>`)
      .join('');
    this.captured.setAttribute('aria-label', `${options.capturedKinds.length} captured pieces`);
    this.advantage.textContent = formatAdvantage(options.balance, color) ?? '';
  }
}

/** Status line, move list and action buttons. */
export class SidePanel {
  readonly element = el('aside', 'panel');
  private readonly status = el('div', 'status');
  private readonly statusDot = el('span', 'status-dot');
  private readonly statusText = el('span', 'status-text');
  private readonly moves = el('ol', 'moves');
  private readonly actions = el('div', 'actions');
  private readonly undoButton: HTMLButtonElement;
  private readonly resignButton: HTMLButtonElement;
  private readonly confirm = el('div', 'confirm');
  private confirming = false;
  private lastMoveCount = -1;

  constructor(handlers: PanelActions, onResignConfirmed: () => void) {
    this.status.setAttribute('role', 'status');
    this.status.append(this.statusDot, this.statusText);

    const heading = el('h2', 'panel-heading', 'Moves');
    this.moves.setAttribute('aria-label', 'Move list');
    this.moves.tabIndex = 0;

    const newGame = button('New game', 'btn btn-primary', handlers.newGame);
    this.undoButton = button('Undo', 'btn', handlers.undo);
    this.resignButton = button('Resign', 'btn btn-danger', () => this.setConfirming(true));
    const flip = button('Flip board', 'btn', handlers.flip);
    this.actions.append(newGame, this.undoButton, this.resignButton, flip);

    const question = el('p', 'confirm-text', 'Resign this game?');
    const yes = button('Yes, resign', 'btn btn-danger-solid', () => {
      this.setConfirming(false);
      onResignConfirmed();
    });
    const no = button('Keep playing', 'btn', () => this.setConfirming(false));
    const buttons = el('div', 'confirm-buttons');
    buttons.append(yes, no);
    this.confirm.append(question, buttons);
    this.confirm.hidden = true;

    this.element.append(this.status, heading, this.moves, this.confirm, this.actions);
  }

  update(snapshot: GameSnapshot): void {
    this.renderStatus(snapshot);
    this.renderMoves(snapshot.sanHistory);
    this.undoButton.disabled = !snapshot.canUndo;
    this.resignButton.disabled = !snapshot.canResign;
    if (!snapshot.canResign && this.confirming) this.setConfirming(false);
  }

  private setConfirming(value: boolean): void {
    this.confirming = value;
    this.confirm.hidden = !value;
    this.actions.hidden = value;
    if (value) this.confirm.querySelector('button')?.focus();
    else this.resignButton.focus();
  }

  private renderStatus(snapshot: GameSnapshot): void {
    let text: string;
    let mode: 'idle' | 'thinking' | 'turn' | 'over' | 'error';
    if (!snapshot.active) {
      text = 'Choose your side to begin';
      mode = 'idle';
    } else if (snapshot.result) {
      const description = describeResult(snapshot.result, snapshot.playerColor);
      text = `${description.title}: ${description.detail}`;
      mode = 'over';
    } else if (snapshot.error) {
      text = 'Computer could not move';
      mode = 'error';
    } else if (snapshot.thinking) {
      text = 'Computer is thinking';
      mode = 'thinking';
    } else {
      const yours = snapshot.turn === snapshot.playerColor;
      text = `${yours ? 'Your' : 'Computer’s'} move${snapshot.checkSquare !== null ? ', check' : ''}`;
      mode = 'turn';
    }
    this.status.dataset.mode = mode;
    this.statusText.textContent = text;
    if (mode === 'thinking') {
      this.statusText.append(el('span', 'ellipsis', ''));
    }
  }

  private renderMoves(sanHistory: string[]): void {
    const rows = pairMoves(sanHistory);
    this.moves.textContent = '';
    const currentPly = sanHistory.length - 1;
    for (const row of rows) {
      const item = el('li', 'move-row');
      item.append(el('span', 'move-number', `${row.number}.`));
      for (const entry of [row.white, row.black]) {
        const cell = el('span', 'move-cell', entry?.san ?? '');
        if (entry && entry.ply === currentPly) {
          cell.classList.add('is-current');
          cell.setAttribute('aria-current', 'true');
        }
        item.append(cell);
      }
      this.moves.append(item);
    }
    if (sanHistory.length !== this.lastMoveCount) {
      this.moves.scrollTop = this.moves.scrollHeight;
      this.lastMoveCount = sanHistory.length;
    }
    if (rows.length === 0) this.moves.append(el('li', 'moves-empty', 'No moves yet'));
  }
}
