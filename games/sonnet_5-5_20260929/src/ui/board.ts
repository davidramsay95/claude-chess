import { Position, pieceColor, pieceType, squareName } from "../engine/position";
import { PIECE_NAMES, pieceLabel, pieceSvg } from "../pieces";
import type { PlayerColor } from "../state";
import { el } from "./dom";
import { checkedKingSquare, displaySquares, legalTargets, type LastMove, type LegalTarget } from "./model";

export interface BoardState {
  position: Position;
  flipped: boolean;
  lastMove: LastMove | null;
  /** True only on the live position, in a running game, on the human's turn. */
  interactive: boolean;
  playerColor: PlayerColor;
}

interface DragState {
  pointerId: number;
  origin: number;
  startX: number;
  startY: number;
  dragging: boolean;
  wasSelected: boolean;
  ghost: HTMLElement | null;
}

const DRAG_THRESHOLD_PX = 6;

const isLightSquare = (square: number): boolean => ((square & 7) + (square >> 4)) % 2 === 1;
const PROMOTION_CHOICES: readonly { letter: string; piece: number }[] = [
  { letter: "q", piece: 5 },
  { letter: "r", piece: 4 },
  { letter: "b", piece: 3 },
  { letter: "n", piece: 2 },
];

/**
 * The 8x8 grid. Squares are created once and updated in place so an in-progress
 * pointer gesture never loses its element.
 */
export class Board {
  readonly root: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly squares = new Map<number, HTMLButtonElement>();
  private state: BoardState | null = null;
  private selected = -1;
  private targets: LegalTarget[] = [];
  private drag: DragState | null = null;
  private promotion: { from: number; target: LegalTarget } | null = null;
  private promotionLayer: HTMLElement | null = null;
  private lastFlipped: boolean | null = null;
  private lastPosition: Position | null = null;
  private lastPly = -1;

  constructor(private readonly onMove: (uci: string) => void) {
    this.grid = el("div", { className: "board", attrs: { role: "group", "aria-label": "Chess board" } });
    this.root = el("div", { className: "board-frame" }, this.grid);
    this.grid.addEventListener("pointerdown", this.handlePointerDown);
    this.grid.addEventListener("pointermove", this.handlePointerMove);
    this.grid.addEventListener("pointerup", this.handlePointerUp);
    this.grid.addEventListener("pointercancel", this.handlePointerCancel);
    this.grid.addEventListener("click", this.handleClick);
    this.grid.addEventListener("keydown", this.handleKeyDown);
  }

  update(state: BoardState): void {
    const changedPosition = this.lastPosition !== state.position || this.lastPly !== state.position.ply;
    this.state = state;
    this.lastPosition = state.position;
    this.lastPly = state.position.ply;
    if (changedPosition || !state.interactive) this.clearSelection();
    this.cancelPromotion();
    this.ensureSquares(state.flipped);
    this.paint();
  }

  private ensureSquares(flipped: boolean): void {
    if (this.lastFlipped === flipped) return;
    this.lastFlipped = flipped;
    this.grid.replaceChildren();
    this.squares.clear();
    const order = displaySquares(flipped);
    order.forEach((square, index) => {
      const node = el("button", {
        className: `square ${isLightSquare(square) ? "light" : "dark"}`,
        attrs: { type: "button", "data-square": String(square) },
      });
      const column = index % 8;
      const row = Math.floor(index / 8);
      if (row === 7) node.dataset.file = squareName(square)[0];
      if (column === 0) node.dataset.rank = squareName(square)[1];
      this.squares.set(square, node);
      this.grid.append(node);
    });
  }

  private paint(): void {
    const state = this.state;
    if (state === null) return;
    const { position } = state;
    const checked = checkedKingSquare(position);
    const targetMap = new Map(this.targets.map((target) => [target.to, target]));

    for (const [square, node] of this.squares) {
      const piece = position.board[square];
      const target = targetMap.get(square);
      const ownPiece = piece !== 0 && pieceColor(piece) === (state.playerColor === "white" ? 0 : 1);
      const classes = ["square", isLightSquare(square) ? "light" : "dark"];
      if (state.lastMove !== null && (state.lastMove.from === square || state.lastMove.to === square)) classes.push("last");
      if (square === this.selected) classes.push("selected");
      if (square === checked) classes.push("check");
      if (target !== undefined) classes.push(target.capture ? "target-capture" : "target");
      if (this.drag?.dragging === true && this.drag.origin === square) classes.push("dragging-origin");
      node.className = classes.join(" ");

      const name = squareName(square);
      const parts = [name, piece === 0 ? "empty" : pieceLabel(piece)];
      if (square === this.selected) parts.push("selected");
      if (target !== undefined) parts.push(target.capture ? "capture available" : "legal move");
      if (square === checked) parts.push("in check");
      node.setAttribute("aria-label", parts.join(", "));
      node.setAttribute("aria-pressed", square === this.selected ? "true" : "false");
      const focusable = state.interactive && (ownPiece || target !== undefined);
      node.tabIndex = focusable ? 0 : -1;
      node.disabled = false;

      const existing = node.dataset.piece;
      const wanted = piece === 0 ? "" : String(piece);
      if (existing !== wanted) {
        node.dataset.piece = wanted;
        node.querySelector(".piece")?.remove();
        if (piece !== 0) {
          const holder = el("span", { className: "piece" });
          holder.innerHTML = pieceSvg(piece);
          node.append(holder);
        }
      }
    }
  }

  private clearSelection(): void {
    this.selected = -1;
    this.targets = [];
  }

  private select(square: number): void {
    const state = this.state;
    if (state === null) return;
    this.selected = square;
    this.targets = legalTargets(state.position, square);
  }

  private isOwnPiece(square: number): boolean {
    const state = this.state;
    if (state === null) return false;
    const piece = state.position.board[square];
    return piece !== 0 && pieceColor(piece) === (state.playerColor === "white" ? 0 : 1);
  }

  private squareFromNode(node: EventTarget | null): number {
    if (!(node instanceof Element)) return -1;
    const holder = node.closest<HTMLElement>("[data-square]");
    return holder === null ? -1 : Number(holder.dataset.square);
  }

  private squareAtPoint(x: number, y: number): number {
    return this.squareFromNode(document.elementFromPoint(x, y));
  }

  private attemptMove(target: LegalTarget): void {
    if (target.promotion) {
      this.promotion = { from: this.selected, target };
      this.paint();
      this.showPromotionPicker(target);
      return;
    }
    this.commit(target.uci);
  }

  private commit(uci: string): void {
    this.clearSelection();
    this.onMove(uci);
    // A rejected move leaves the session untouched, so repaint to drop stale highlights.
    this.paint();
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const state = this.state;
    if (state === null || !state.interactive || this.promotion !== null) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const square = this.squareFromNode(event.target);
    if (square < 0) return;

    const wasSelected = this.selected === square;
    if (this.isOwnPiece(square) && !wasSelected) {
      this.select(square);
      this.paint();
    }
    this.drag = {
      pointerId: event.pointerId,
      origin: square,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      wasSelected,
      ghost: null,
    };
    this.grid.setPointerCapture(event.pointerId);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    if (!drag.dragging) {
      const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (moved < DRAG_THRESHOLD_PX || !this.isOwnPiece(drag.origin)) return;
      drag.dragging = true;
      if (this.selected !== drag.origin) this.select(drag.origin);
      drag.ghost = this.createGhost(drag.origin);
      this.paint();
    }
    if (drag.ghost !== null) this.positionGhost(drag.ghost, event.clientX, event.clientY);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    this.endDrag();
    const dropSquare = this.squareAtPoint(event.clientX, event.clientY);
    const target = this.targets.find((candidate) => candidate.to === dropSquare);

    if (drag.dragging) {
      if (target !== undefined) this.attemptMove(target);
      else this.paint();
      return;
    }

    // A tap: it must end on the square it began on.
    if (dropSquare !== drag.origin) return;
    if (this.selected >= 0 && target !== undefined) {
      this.attemptMove(target);
    } else if (this.isOwnPiece(drag.origin)) {
      if (drag.wasSelected) this.clearSelection();
      this.paint();
    } else {
      this.clearSelection();
      this.paint();
    }
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (this.drag?.pointerId !== event.pointerId) return;
    this.endDrag();
    this.paint();
  };

  /** Keyboard activation arrives as a click with detail 0; pointer clicks are already handled. */
  private readonly handleClick = (event: MouseEvent): void => {
    if (event.detail !== 0) return;
    const state = this.state;
    if (state === null || !state.interactive || this.promotion !== null) return;
    const square = this.squareFromNode(event.target);
    if (square < 0) return;
    const target = this.targets.find((candidate) => candidate.to === square);
    if (this.selected >= 0 && target !== undefined) {
      this.attemptMove(target);
    } else if (this.isOwnPiece(square) && square !== this.selected) {
      this.select(square);
      this.paint();
    } else {
      this.clearSelection();
      this.paint();
    }
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.selected >= 0) {
      this.clearSelection();
      this.paint();
    }
  };

  private endDrag(): void {
    const drag = this.drag;
    if (drag === null) return;
    drag.ghost?.remove();
    if (this.grid.hasPointerCapture(drag.pointerId)) this.grid.releasePointerCapture(drag.pointerId);
    this.drag = null;
  }

  private createGhost(square: number): HTMLElement {
    const source = this.squares.get(square);
    const size = source?.getBoundingClientRect().width ?? 48;
    const ghost = el("div", { className: "piece-ghost" });
    ghost.innerHTML = pieceSvg(this.state?.position.board[square] ?? 0);
    // Size and position are per-gesture values that CSS cannot know.
    ghost.style.width = `${size}px`;
    ghost.style.height = `${size}px`;
    document.body.append(ghost);
    return ghost;
  }

  private positionGhost(ghost: HTMLElement, x: number, y: number): void {
    const half = ghost.offsetWidth / 2;
    ghost.style.transform = `translate(${x - half}px, ${y - half}px)`;
  }

  private showPromotionPicker(target: LegalTarget): void {
    const state = this.state;
    if (state === null) return;
    const color = state.playerColor === "white" ? 0 : 1;
    const layer = el("div", { className: "promotion", attrs: { role: "dialog", "aria-label": "Choose a promotion piece" } });
    const picker = el("div", { className: "promotion-picker" });
    for (const choice of PROMOTION_CHOICES) {
      const piece = choice.piece | (color << 3);
      const option = el("button", {
        className: "promotion-option",
        attrs: { type: "button", "aria-label": `Promote to ${PIECE_NAMES[pieceType(piece)]}` },
      });
      option.innerHTML = pieceSvg(piece);
      option.addEventListener("click", () => {
        this.closePromotion();
        this.commit(`${target.uci}${choice.letter}`);
      });
      picker.append(option);
    }
    const cancel = el("button", { className: "promotion-cancel", text: "Cancel", attrs: { type: "button" } });
    cancel.addEventListener("click", () => {
      this.closePromotion();
      this.paint();
    });
    layer.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      cancel.click();
    });
    layer.append(el("div", { className: "promotion-card" }, el("p", { className: "promotion-title", text: "Promote to" }), picker, cancel));
    this.promotionLayer = layer;
    this.root.append(layer);
    layer.querySelector<HTMLElement>(".promotion-option")?.focus();
  }

  private closePromotion(): void {
    this.promotionLayer?.remove();
    this.promotionLayer = null;
    this.promotion = null;
  }

  private cancelPromotion(): void {
    if (this.promotion !== null) this.closePromotion();
  }

  /** True while a promotion choice is pending, so screens can ignore keys meant for the picker. */
  get choosingPromotion(): boolean {
    return this.promotion !== null;
  }
}
