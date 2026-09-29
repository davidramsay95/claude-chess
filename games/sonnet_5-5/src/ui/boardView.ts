import { type Color, pieceColor, pieceKind, squareName } from '../engine/types';
import type { MoveAnimation } from './moveAnimation';
import type { GameSnapshot } from './controller';
import { colorName, kindName, pieceSvg } from './pieces';
import {
  displayIndexToSquare,
  displayPosition,
  fileLabelFor,
  rankLabelFor,
  squareFromPoint,
} from './geometry';

export interface BoardHandlers {
  /** Whether a press on this square may start selecting or dragging a piece. */
  canPickUp: (square: number) => boolean;
  select: (square: number) => void;
  tap: (square: number) => void;
  drop: (from: number, to: number) => void;
}

/** Pixels a pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD = 5;

interface DragState {
  pointerId: number;
  from: number;
  startX: number;
  startY: number;
  dragging: boolean;
  wasSelected: boolean;
  pieceEl: HTMLElement | null;
}

/**
 * Renders the 8x8 grid and handles pointer input. Squares and piece elements are
 * reused between renders so an in-flight drag survives the re-render triggered by selection.
 */
export class BoardView {
  private readonly squares = new Map<number, HTMLElement>();
  private orientation: Color | null = null;
  private drag: DragState | null = null;
  private interactive = false;
  private focusSquare = 0;
  private selected: number | null = null;

  constructor(
    readonly element: HTMLElement,
    private readonly handlers: BoardHandlers,
  ) {
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointercancel', this.onPointerCancel);
    element.addEventListener('keydown', this.onKeyDown);
  }

  render(snapshot: GameSnapshot, orientation: Color): void {
    if (orientation !== this.orientation) this.buildSquares(orientation);
    this.interactive = snapshot.active && !snapshot.thinking && !snapshot.result && snapshot.pendingPromotion === null &&
      snapshot.turn === snapshot.playerColor;
    this.selected = snapshot.selected;
    this.element.classList.toggle('is-interactive', this.interactive);
    this.element.setAttribute('aria-busy', String(snapshot.thinking));

    const targets = new Map(snapshot.targets.map((t) => [t.square, t]));
    for (const [square, el] of this.squares) {
      const piece = snapshot.board[square];
      this.syncPiece(el, piece);
      const target = targets.get(square);
      el.classList.toggle('is-selected', snapshot.selected === square);
      el.classList.toggle('is-last', snapshot.lastMove?.from === square || snapshot.lastMove?.to === square);
      el.classList.toggle('is-check', snapshot.checkSquare === square);
      el.classList.toggle('is-target', target !== undefined && !target.capture);
      el.classList.toggle('is-capture', target?.capture === true);
      el.setAttribute('aria-label', this.labelFor(square, piece, snapshot));
      el.setAttribute('aria-pressed', String(snapshot.selected === square));
    }
    this.playAnimations(snapshot.animations);
  }

  private labelFor(square: number, piece: number, snapshot: GameSnapshot): string {
    const name = squareName(square);
    let label = piece === 0 ? name : `${colorName(pieceColor(piece))} ${kindName(pieceKind(piece))} on ${name}`;
    if (snapshot.targets.some((t) => t.square === square)) label += ', legal move';
    return label;
  }

  private buildSquares(orientation: Color): void {
    this.orientation = orientation;
    this.element.textContent = '';
    this.squares.clear();
    for (let index = 0; index < 64; index++) {
      const square = displayIndexToSquare(index, orientation);
      const { row, col } = displayPosition(square, orientation);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
      el.dataset.square = String(square);
      el.tabIndex = square === this.focusSquare ? 0 : -1;
      const file = fileLabelFor(square, orientation);
      const rank = rankLabelFor(square, orientation);
      if (rank) el.append(this.coord('coord coord-rank', rank));
      if (file) el.append(this.coord('coord coord-file', file));
      this.squares.set(square, el);
      this.element.append(el);
    }
  }

  private coord(className: string, text: string): HTMLElement {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  private syncPiece(el: HTMLElement, piece: number): void {
    const existing = el.querySelector<HTMLElement>(':scope > .piece');
    const code = piece === 0 ? '' : String(piece);
    if (existing && existing.dataset.piece === code) return;
    existing?.remove();
    if (piece === 0) return;
    const pieceEl = document.createElement('span');
    pieceEl.className = 'piece';
    pieceEl.dataset.piece = code;
    pieceEl.innerHTML = pieceSvg(pieceKind(piece), pieceColor(piece));
    el.prepend(pieceEl);
  }

  /** FLIP-style slide: place the piece at its origin without a transition, then release it. */
  private playAnimations(animations: MoveAnimation[]): void {
    for (const { from, to } of animations) {
      const pieceEl = this.squares.get(to)?.querySelector<HTMLElement>(':scope > .piece');
      if (!pieceEl || !this.orientation) continue;
      const a = displayPosition(from, this.orientation);
      const b = displayPosition(to, this.orientation);
      pieceEl.style.transition = 'none';
      pieceEl.style.transform = `translate(${(a.col - b.col) * 100}%, ${(a.row - b.row) * 100}%)`;
      pieceEl.classList.add('is-moving');
      void pieceEl.offsetWidth;
      pieceEl.style.transition = '';
      pieceEl.style.transform = '';
      const done = (): void => pieceEl.classList.remove('is-moving');
      pieceEl.addEventListener('transitionend', done, { once: true });
      setTimeout(done, 400);
    }
  }

  private squareOf(event: PointerEvent): number | null {
    const rect = this.element.getBoundingClientRect();
    if (this.orientation === null) return null;
    return squareFromPoint(event.clientX, event.clientY, { left: rect.left, top: rect.top, size: rect.width }, this.orientation);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const square = this.squareOf(event);
    if (square === null || !this.interactive) return;
    if (!this.handlers.canPickUp(square)) {
      this.handlers.tap(square);
      return;
    }
    const wasSelected = this.selected === square;
    if (!wasSelected) this.handlers.select(square);
    this.focusSquare = square;
    this.drag = {
      pointerId: event.pointerId,
      from: square,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      wasSelected,
      pieceEl: this.squares.get(square)?.querySelector<HTMLElement>(':scope > .piece') ?? null,
    };
    this.element.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!drag.dragging) {
      drag.dragging = true;
      // Re-fetch: selection re-rendered after pointerdown may have kept the same element, but be safe.
      drag.pieceEl = this.squares.get(drag.from)?.querySelector<HTMLElement>(':scope > .piece') ?? null;
      drag.pieceEl?.classList.add('is-dragging');
    }
    if (drag.pieceEl) drag.pieceEl.style.transform = `translate(${dx}px, ${dy}px) scale(1.12)`;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.finishDrag();
    if (drag.dragging) {
      const target = this.squareOf(event);
      if (target === null) this.handlers.drop(drag.from, drag.from);
      else this.handlers.drop(drag.from, target);
    } else if (drag.wasSelected) {
      this.handlers.tap(drag.from);
    }
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.finishDrag();
    if (drag.dragging) this.handlers.drop(drag.from, drag.from);
  };

  private finishDrag(): void {
    const drag = this.drag;
    this.drag = null;
    if (!drag?.pieceEl) return;
    drag.pieceEl.classList.remove('is-dragging');
    drag.pieceEl.style.transform = '';
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.dataset.square === undefined || !this.orientation) return;
    const current = displayPosition(Number(target.dataset.square), this.orientation);
    const delta: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const step = delta[event.key];
    if (step) {
      const row = Math.min(7, Math.max(0, current.row + step[0]));
      const col = Math.min(7, Math.max(0, current.col + step[1]));
      this.focusSquareAt(displayIndexToSquare(row * 8 + col, this.orientation));
      event.preventDefault();
    } else if (event.key === 'Enter' || event.key === ' ') {
      const square = Number(target.dataset.square);
      event.preventDefault();
      if (!this.interactive) return;
      if (this.handlers.canPickUp(square) || this.selected !== null) this.handlers.tap(square);
    }
  };

  private focusSquareAt(square: number): void {
    for (const [sq, el] of this.squares) el.tabIndex = sq === square ? 0 : -1;
    this.focusSquare = square;
    this.squares.get(square)?.focus();
  }
}
