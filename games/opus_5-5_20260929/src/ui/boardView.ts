import {
  Color,
  Position,
  WHITE,
  moveFrom,
  movePromotion,
  moveTo,
  moveToUci,
  pieceColor,
  pieceType,
  squareName,
} from "../core/position";
import { PieceColor, PieceKind, pieceSvg } from "./pieces";
import { Side, displaySquare, squareAtPoint } from "./presenters";
import { svgInstance } from "./svgInstance";

export interface BoardViewModel {
  position: Position;
  orientation: Side;
  lastMove: { from: number; to: number } | null;
  /** Square of a king in check, or -1. */
  checkSquare: number;
  /** Legal moves the human may make now; empty when the board is read-only. */
  movable: number[];
  /** Slide the last-moved piece into place (used for engine replies and navigation). */
  animate: boolean;
}

const KINDS: PieceKind[] = ["p", "p", "n", "b", "r", "q", "k"];
const PIECE_NAMES = ["", "pawn", "knight", "bishop", "rook", "queen", "king"];
const PROMOTION_CHOICES: PieceKind[] = ["q", "r", "b", "n"];
const DRAG_THRESHOLD = 4;

const svgForPiece = (piece: number): string => {
  const color: PieceColor = pieceColor(piece) === WHITE ? "w" : "b";
  return svgInstance(pieceSvg(KINDS[pieceType(piece)], color));
};

interface DragState {
  from: number;
  pointerId: number;
  startX: number;
  startY: number;
  ghost: HTMLElement | null;
  wasSelected: boolean;
}

/** Renders the board and turns clicks and drags into UCI moves. */
export class BoardView {
  readonly element: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly cells: HTMLElement[] = [];
  private readonly shownPieces: number[] = new Array<number>(64).fill(-1);
  private model: BoardViewModel | null = null;
  private selected = -1;
  private drag: DragState | null = null;
  private promotionPicker: HTMLElement | null = null;

  constructor(private readonly onMove: (uci: string) => void) {
    this.element = document.createElement("div");
    this.element.className = "board-frame";
    this.grid = document.createElement("div");
    this.grid.className = "board";
    this.grid.setAttribute("role", "grid");
    this.grid.setAttribute("aria-label", "Chess board");
    for (let index = 0; index < 64; index++) {
      const cell = document.createElement("div");
      cell.className = "square";
      cell.setAttribute("role", "gridcell");
      this.cells.push(cell);
      this.grid.append(cell);
    }
    this.element.append(this.grid);
    this.grid.addEventListener("pointerdown", (event) => this.handlePointerDown(event));
    this.grid.addEventListener("pointermove", (event) => this.handlePointerMove(event));
    this.grid.addEventListener("pointerup", (event) => this.handlePointerUp(event));
    this.grid.addEventListener("pointercancel", () => this.endDrag());
    this.grid.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  /** Redraws the board for a new model. Selection survives only if the same moves are still available. */
  render(model: BoardViewModel): void {
    const orientationChanged = this.model?.orientation !== model.orientation;
    this.model = model;
    if (!model.movable.some((move) => moveFrom(move) === this.selected)) this.selected = -1;
    this.closePromotionPicker();
    if (orientationChanged) this.shownPieces.fill(-1);
    this.cells.forEach((cell, index) => this.renderCell(cell, index, model));
    if (model.animate && model.lastMove) this.animateArrival(model.lastMove.from, model.lastMove.to);
  }

  private renderCell(cell: HTMLElement, index: number, model: BoardViewModel): void {
    const square = displaySquare(index, model.orientation);
    const piece = model.position.board[square];
    const row = index >> 3;
    const column = index & 7;
    const targets = this.targetsFrom(this.selected);
    const classes = ["square", ((square >> 4) + (square & 7)) % 2 === 0 ? "dark" : "light"];
    if (model.lastMove && (model.lastMove.from === square || model.lastMove.to === square)) classes.push("last");
    if (square === model.checkSquare) classes.push("check");
    if (square === this.selected) classes.push("selected");
    if (targets.includes(square)) classes.push(piece ? "target capture" : "target");
    if (model.movable.some((move) => moveFrom(move) === square)) classes.push("movable");
    cell.className = classes.join(" ");
    cell.dataset.square = squareName(square);
    cell.setAttribute(
      "aria-label",
      piece
        ? `${squareName(square)} ${pieceColor(piece) === WHITE ? "white" : "black"} ${PIECE_NAMES[pieceType(piece)]}`
        : squareName(square),
    );
    if (this.shownPieces[index] === piece) return;
    this.shownPieces[index] = piece;
    const rankLabel = column === 0 ? `<span class="coord rank">${squareName(square)[1]}</span>` : "";
    const fileLabel = row === 7 ? `<span class="coord file">${squareName(square)[0]}</span>` : "";
    const pieceMarkup = piece ? `<div class="piece">${svgForPiece(piece)}</div>` : "";
    cell.innerHTML = rankLabel + fileLabel + pieceMarkup;
  }

  private cellForSquare(square: number): HTMLElement | null {
    if (!this.model) return null;
    const index = this.cells.findIndex((_, candidate) => displaySquare(candidate, this.model?.orientation ?? "white") === square);
    return index >= 0 ? this.cells[index] : null;
  }

  private animateArrival(from: number, to: number): void {
    const fromCell = this.cellForSquare(from);
    const toCell = this.cellForSquare(to);
    const piece = toCell?.querySelector<HTMLElement>(".piece");
    if (!fromCell || !toCell || !piece) return;
    const fromRect = fromCell.getBoundingClientRect();
    const toRect = toCell.getBoundingClientRect();
    piece.animate(
      [
        { transform: `translate(${fromRect.left - toRect.left}px, ${fromRect.top - toRect.top}px)` },
        { transform: "translate(0, 0)" },
      ],
      { duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180, easing: "cubic-bezier(.2,.7,.3,1)" },
    );
  }

  private targetsFrom(square: number): number[] {
    if (square < 0 || !this.model) return [];
    return this.model.movable.filter((move) => moveFrom(move) === square).map(moveTo);
  }

  private squareFromEvent(event: PointerEvent): number {
    if (!this.model) return -1;
    return squareAtPoint(event.clientX, event.clientY, this.grid.getBoundingClientRect(), this.model.orientation);
  }

  private ownsMovablePiece(square: number): boolean {
    return this.model?.movable.some((move) => moveFrom(move) === square) ?? false;
  }

  private handlePointerDown(event: PointerEvent): void {
    if (!this.model || event.button !== 0 || this.promotionPicker) return;
    const square = this.squareFromEvent(event);
    if (square < 0) return;
    if (this.selected >= 0 && this.targetsFrom(this.selected).includes(square)) {
      this.tryMove(this.selected, square);
      return;
    }
    if (!this.ownsMovablePiece(square)) {
      this.select(-1);
      return;
    }
    event.preventDefault();
    const wasSelected = this.selected === square;
    this.select(square);
    this.grid.setPointerCapture(event.pointerId);
    this.drag = { from: square, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, ghost: null, wasSelected };
  }

  private handlePointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.ghost) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD) return;
      drag.ghost = this.createGhost(drag.from);
    }
    if (!drag.ghost) return;
    const size = drag.ghost.offsetWidth;
    drag.ghost.style.transform = `translate(${event.clientX - size / 2}px, ${event.clientY - size / 2}px)`;
  }

  private handlePointerUp(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const target = this.squareFromEvent(event);
    const dragged = drag.ghost !== null;
    this.endDrag();
    if (target !== drag.from && this.targetsFrom(drag.from).includes(target)) {
      this.tryMove(drag.from, target);
    } else if (!dragged && drag.wasSelected) {
      this.select(-1);
    }
  }

  private createGhost(from: number): HTMLElement | null {
    const cell = this.cellForSquare(from);
    const piece = cell?.querySelector<HTMLElement>(".piece");
    if (!cell || !piece) return null;
    const ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    ghost.innerHTML = svgInstance(piece.innerHTML);
    ghost.style.width = `${cell.offsetWidth}px`;
    ghost.style.height = `${cell.offsetHeight}px`;
    document.body.append(ghost);
    cell.classList.add("dragging");
    return ghost;
  }

  private endDrag(): void {
    if (!this.drag) return;
    this.drag.ghost?.remove();
    this.cells.forEach((cell) => cell.classList.remove("dragging"));
    if (this.grid.hasPointerCapture(this.drag.pointerId)) this.grid.releasePointerCapture(this.drag.pointerId);
    this.drag = null;
  }

  private select(square: number): void {
    this.selected = square;
    if (this.model) this.cells.forEach((cell, index) => this.model && this.renderCell(cell, index, this.model));
  }

  private tryMove(from: number, to: number): void {
    const candidates = this.model?.movable.filter((move) => moveFrom(move) === from && moveTo(move) === to) ?? [];
    if (candidates.length === 0) return;
    if (candidates.length === 1) {
      this.select(-1);
      this.onMove(moveToUci(candidates[0]));
      return;
    }
    this.openPromotionPicker(to, candidates);
  }

  private openPromotionPicker(to: number, candidates: number[]): void {
    const model = this.model;
    if (!model) return;
    const color: Color = pieceColor(model.position.board[moveFrom(candidates[0])]);
    const picker = document.createElement("div");
    picker.className = "promotion";
    picker.setAttribute("role", "dialog");
    picker.setAttribute("aria-label", "Choose a piece to promote to");
    const column = this.cells.indexOf(this.cellForSquare(to) ?? this.cells[0]) & 7;
    picker.style.setProperty("--column", String(column));
    for (const kind of PROMOTION_CHOICES) {
      const move = candidates.find((candidate) => KINDS[movePromotion(candidate)] === kind);
      if (move === undefined) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "promotion-choice";
      button.setAttribute("aria-label", `Promote to ${PIECE_NAMES[KINDS.indexOf(kind)]}`);
      button.innerHTML = svgInstance(pieceSvg(kind, color === WHITE ? "w" : "b"));
      button.addEventListener("click", () => {
        this.closePromotionPicker();
        this.select(-1);
        this.onMove(moveToUci(move));
      });
      picker.append(button);
    }
    picker.addEventListener("pointerdown", (event) => event.stopPropagation());
    const backdrop = document.createElement("div");
    backdrop.className = "promotion-backdrop";
    backdrop.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      this.closePromotionPicker();
    });
    backdrop.append(picker);
    this.element.append(backdrop);
    this.promotionPicker = backdrop;
    picker.querySelector<HTMLButtonElement>("button")?.focus();
    picker.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.closePromotionPicker();
    });
  }

  private closePromotionPicker(): void {
    this.promotionPicker?.remove();
    this.promotionPicker = null;
  }
}
