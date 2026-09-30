/**
 * The board: 64 buttons in a CSS grid, each holding an inline SVG piece.
 *
 * Input is deliberately offered twice over. Click a piece then click a target,
 * or drag it: touch screens and mice both get the interaction they expect, and
 * keyboard users get the same thing because every square is a real button.
 */

import { Position, algebraic, fileOf, rankOf } from "../engine/position.ts";
import { pieceSvg, type PieceColor, type PieceKind } from "./pieces.ts";

const KIND_BY_TYPE: readonly PieceKind[] = ["p", "p", "n", "b", "r", "q", "k"];
const PIECE_NAMES = ["", "pawn", "knight", "bishop", "rook", "queen", "king"];
/** Pointer travel, in pixels, before a press becomes a drag rather than a tap. */
const DRAG_THRESHOLD = 5;

export interface BoardHost {
  /** Squares this piece may legally move to, or an empty list. */
  targetsFrom(square: number): number[];
  /** Called once the user has chosen both ends of a move. */
  requestMove(from: number, to: number): void;
  /** False while the engine is thinking, the game is over, or history is shown. */
  interactive(): boolean;
}

export interface RenderOptions {
  lastMove: { from: number; to: number } | null;
  checkSquare: number | null;
}

export class BoardView {
  private readonly squares = new Map<number, HTMLButtonElement>();
  private orientation: "white" | "black" = "white";
  private selected: number | null = null;
  private targets: number[] = [];
  private position: Position | null = null;
  private options: RenderOptions = { lastMove: null, checkSquare: null };

  private dragSquare: number | null = null;
  private dragGhost: HTMLElement | null = null;
  private dragStart: { x: number; y: number } | null = null;
  private dragging = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly host: BoardHost,
  ) {
    this.root.classList.add("board");
    this.buildSquares();
    this.root.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("pointercancel", this.cancelDrag);
  }

  private buildSquares(): void {
    for (let rank = 7; rank >= 0; rank--) {
      for (let file = 0; file < 8; file++) {
        const square = rank * 16 + file;
        const button = document.createElement("button");
        button.type = "button";
        button.className = `sq ${(file + rank) % 2 === 0 ? "dark" : "light"}`;
        button.dataset.square = String(square);
        button.addEventListener("click", () => this.handleClick(square));
        this.squares.set(square, button);
        this.root.append(button);
      }
    }
    this.applyOrientation();
  }

  setOrientation(orientation: "white" | "black"): void {
    if (this.orientation === orientation) return;
    this.orientation = orientation;
    this.applyOrientation();
    if (this.position) this.render(this.position, this.options);
  }

  private applyOrientation(): void {
    const ranks = this.orientation === "white" ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
    const files = this.orientation === "white" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
    for (const rank of ranks) {
      for (const file of files) {
        const button = this.squares.get(rank * 16 + file);
        if (button) this.root.append(button);
      }
    }
  }

  clearSelection(): void {
    this.selected = null;
    this.targets = [];
    this.paintSelection();
  }

  render(position: Position, options: RenderOptions): void {
    this.position = position;
    this.options = options;
    for (const [square, button] of this.squares) {
      const piece = position.pieceAt(square);
      const type = piece & 7;
      const colour: PieceColor = (piece >> 3) & 1 ? "b" : "w";
      const name = algebraic(square);

      button.innerHTML = "";
      if (piece) {
        const holder = document.createElement("span");
        holder.className = "pc";
        holder.innerHTML = pieceSvg(KIND_BY_TYPE[type], colour);
        button.append(holder);
      }
      this.addCoordinates(button, square);

      button.classList.toggle("last-from", options.lastMove?.from === square);
      button.classList.toggle("last-to", options.lastMove?.to === square);
      button.classList.toggle("in-check", options.checkSquare === square);
      button.setAttribute(
        "aria-label",
        piece
          ? `${name}, ${colour === "w" ? "white" : "black"} ${PIECE_NAMES[type]}`
          : `${name}, empty`,
      );
    }
    this.paintSelection();
  }

  /** File letters along the bottom edge, rank numbers along the left edge. */
  private addCoordinates(button: HTMLButtonElement, square: number): void {
    const file = fileOf(square);
    const rank = rankOf(square);
    const bottomRank = this.orientation === "white" ? 0 : 7;
    const leftFile = this.orientation === "white" ? 0 : 7;
    if (rank === bottomRank) {
      const label = document.createElement("span");
      label.className = "coord file";
      label.textContent = String.fromCharCode(97 + file);
      button.append(label);
    }
    if (file === leftFile) {
      const label = document.createElement("span");
      label.className = "coord rank";
      label.textContent = String(rank + 1);
      button.append(label);
    }
  }

  private paintSelection(): void {
    for (const [square, button] of this.squares) {
      const isTarget = this.targets.includes(square);
      button.classList.toggle("selected", this.selected === square);
      button.classList.toggle("target", isTarget);
      button.classList.toggle(
        "capture-target",
        isTarget && this.position !== null && this.position.pieceAt(square) !== 0,
      );
    }
  }

  private handleClick(square: number): void {
    if (this.dragging) return;
    if (!this.host.interactive()) return;
    if (this.selected !== null && this.targets.includes(square)) {
      const from = this.selected;
      this.clearSelection();
      this.host.requestMove(from, square);
      return;
    }
    this.select(square);
  }

  private select(square: number): void {
    const targets = this.host.targetsFrom(square);
    if (targets.length === 0) {
      this.clearSelection();
      return;
    }
    this.selected = square;
    this.targets = targets;
    this.paintSelection();
  }

  private squareFromEvent(event: PointerEvent): number | null {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const button = element?.closest<HTMLElement>("[data-square]");
    if (!button?.dataset.square) return null;
    return Number(button.dataset.square);
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.host.interactive()) return;
    const square = this.squareFromEvent(event);
    if (square === null) return;
    if (this.host.targetsFrom(square).length === 0) return;
    this.dragSquare = square;
    this.dragStart = { x: event.clientX, y: event.clientY };
    this.dragging = false;
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.dragSquare === null || !this.dragStart) return;
    const travelled = Math.hypot(event.clientX - this.dragStart.x, event.clientY - this.dragStart.y);
    if (!this.dragging && travelled < DRAG_THRESHOLD) return;
    if (!this.dragging) {
      this.dragging = true;
      this.select(this.dragSquare);
      this.startGhost(this.dragSquare);
    }
    event.preventDefault();
    this.moveGhost(event.clientX, event.clientY);
    const hovered = this.squareFromEvent(event);
    for (const [square, button] of this.squares) {
      button.classList.toggle("hovered", hovered === square && this.targets.includes(square));
    }
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.dragSquare === null) return;
    const from = this.dragSquare;
    const wasDragging = this.dragging;
    const target = wasDragging ? this.squareFromEvent(event) : null;
    this.cancelDrag();
    if (!wasDragging) return;
    if (target !== null && target !== from && this.targets.includes(target)) {
      this.clearSelection();
      this.host.requestMove(from, target);
    } else {
      this.clearSelection();
    }
    // Swallow the click the browser fires after a drag.
    setTimeout(() => {
      this.dragging = false;
    }, 0);
  };

  private readonly cancelDrag = (): void => {
    this.dragSquare = null;
    this.dragStart = null;
    this.dragGhost?.remove();
    this.dragGhost = null;
    for (const button of this.squares.values()) button.classList.remove("hovered", "dragging");
  };

  private startGhost(square: number): void {
    const source = this.squares.get(square);
    const piece = source?.querySelector(".pc");
    if (!source || !piece) return;
    const rect = source.getBoundingClientRect();
    const ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.innerHTML = piece.innerHTML;
    document.body.append(ghost);
    this.dragGhost = ghost;
    source.classList.add("dragging");
  }

  private moveGhost(x: number, y: number): void {
    if (!this.dragGhost) return;
    this.dragGhost.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  }
}
