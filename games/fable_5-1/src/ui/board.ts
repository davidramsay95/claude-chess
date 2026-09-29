import { isCapture, moveFrom, movePromotion, moveTo, type Move } from "../engine/move";
import {
  BISHOP,
  KNIGHT,
  NO_SQUARE,
  PAWN,
  QUEEN,
  ROOK,
  WHITE,
  fileOf,
  makePiece,
  pieceColorOf,
  pieceTypeOf,
  rankOf,
  squareOf,
  squareToAlgebraic,
  type Color,
  type Square,
} from "../engine/types";
import { pieceSvg } from "./pieces";
import type { PlayerMoveResult } from "./game";

export interface BoardState {
  /** Piece code per 0x88 square; 0 for empty. */
  pieceAt: (sq: Square) => number;
  /** Legal moves from a square, empty when the viewer may not move that piece right now. */
  legalMovesFrom: (sq: Square) => Move[];
  lastMove: Move | null;
  /** Square of the king currently in check, or NO_SQUARE. */
  checkSquare: Square;
  orientation: Color;
  interactive: boolean;
}

export interface BoardHandlers {
  onMove: (from: Square, to: Square, promotion?: number) => PlayerMoveResult;
}

const FILES = "abcdefgh";
const PIECE_NAMES = ["", "pawn", "knight", "bishop", "rook", "queen", "king"];
const PROMOTION_CHOICES = [QUEEN, ROOK, BISHOP, KNIGHT];

interface DragState {
  from: Square;
  pointerId: number;
  element: HTMLElement;
  moved: boolean;
  /** True when the piece was already selected before this press, so a plain tap toggles it off. */
  wasSelected: boolean;
}

/**
 * Renders the board as 64 square buttons plus a separate layer of absolutely positioned
 * pieces, so a move can animate as a slide instead of a re-render.
 */
export class Board {
  private readonly root: HTMLElement;
  private readonly squaresLayer: HTMLElement;
  private readonly piecesLayer: HTMLElement;
  private readonly squares: HTMLButtonElement[] = [];
  private readonly pieceElements = new Map<Square, HTMLElement>();
  private promotionPicker: HTMLElement | null = null;
  private state: BoardState | null = null;
  private selected: Square = NO_SQUARE;
  private targets: Move[] = [];
  private drag: DragState | null = null;
  private readonly handlers: BoardHandlers;

  constructor(container: HTMLElement, handlers: BoardHandlers) {
    this.handlers = handlers;
    this.root = document.createElement("div");
    this.root.className = "board";
    this.squaresLayer = document.createElement("div");
    this.squaresLayer.className = "board__squares";
    this.piecesLayer = document.createElement("div");
    this.piecesLayer.className = "board__pieces";
    for (let i = 0; i < 64; i++) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "square";
      button.addEventListener("click", this.onSquareClick);
      this.squares.push(button);
      this.squaresLayer.append(button);
    }
    this.root.append(this.squaresLayer, this.piecesLayer);
    this.root.addEventListener("pointerdown", this.onPointerDown);
    this.root.addEventListener("pointermove", this.onPointerMove);
    this.root.addEventListener("pointerup", this.onPointerUp);
    this.root.addEventListener("pointercancel", this.onPointerCancel);
    container.append(this.root);
  }

  render(state: BoardState): void {
    const flipped = this.state !== null && this.state.orientation !== state.orientation;
    this.state = state;
    if (this.selected !== NO_SQUARE) {
      this.targets = state.legalMovesFrom(this.selected);
      if (this.targets.length === 0) this.selected = NO_SQUARE;
    }
    if (flipped) this.root.classList.add("board--no-motion");
    this.renderSquares();
    this.renderPieces();
    if (flipped) {
      // Force a style flush so the re-positioned pieces do not animate across the board.
      void this.root.offsetWidth;
      this.root.classList.remove("board--no-motion");
    }
  }

  clearSelection(): void {
    this.closePromotionPicker();
    if (this.drag !== null) this.endDrag(this.drag);
    this.selected = NO_SQUARE;
    this.targets = [];
    this.renderSquares();
  }

  private squareAtIndex(index: number): Square {
    const row = Math.floor(index / 8);
    const col = index % 8;
    return this.state?.orientation === WHITE ? squareOf(col, 7 - row) : squareOf(7 - col, row);
  }

  private visualPosition(sq: Square): { col: number; row: number } {
    const whiteBottom = this.state?.orientation === WHITE;
    return {
      col: whiteBottom ? fileOf(sq) : 7 - fileOf(sq),
      row: whiteBottom ? 7 - rankOf(sq) : rankOf(sq),
    };
  }

  private renderSquares(): void {
    const state = this.state;
    if (state === null) return;
    const lastFrom = state.lastMove === null ? NO_SQUARE : moveFrom(state.lastMove);
    const lastTo = state.lastMove === null ? NO_SQUARE : moveTo(state.lastMove);
    const targetSquares = new Map<Square, boolean>();
    for (const m of this.targets) targetSquares.set(moveTo(m), isCapture(m));

    this.squares.forEach((button, index) => {
      const sq = this.squareAtIndex(index);
      const { col, row } = this.visualPosition(sq);
      const piece = state.pieceAt(sq);
      const light = (fileOf(sq) + rankOf(sq)) % 2 === 1;
      button.className = "square";
      button.classList.add(light ? "square--light" : "square--dark");
      if (sq === this.selected) button.classList.add("square--selected");
      if (sq === lastFrom || sq === lastTo) button.classList.add("square--last");
      if (sq === state.checkSquare) button.classList.add("square--check");
      const capture = targetSquares.get(sq);
      if (capture !== undefined) button.classList.add(capture ? "square--capture" : "square--target");
      button.dataset.square = String(sq);
      button.dataset.file = row === 7 ? FILES[fileOf(sq)] : "";
      button.dataset.rank = col === 0 ? String(rankOf(sq) + 1) : "";
      const name =
        piece === 0
          ? "empty"
          : `${pieceColorOf(piece) === WHITE ? "white" : "black"} ${PIECE_NAMES[pieceTypeOf(piece)]}`;
      button.setAttribute("aria-label", `${squareToAlgebraic(sq)}, ${name}`);
      button.setAttribute("aria-pressed", sq === this.selected ? "true" : "false");
      button.disabled = !state.interactive;
    });
  }

  /**
   * Diffs the piece layer against the new position. A piece that vanished from one square
   * and reappeared on another with no other candidate slides there; everything else fades.
   */
  private renderPieces(): void {
    const state = this.state;
    if (state === null) return;
    const wanted = new Map<Square, number>();
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const sq = squareOf(file, rank);
        const piece = state.pieceAt(sq);
        if (piece !== 0) wanted.set(sq, piece);
      }
    }
    // Unmatched entries leave the map now, before movers are re-keyed onto squares they vacate.
    const unmatchedOld = new Map<Square, HTMLElement>();
    for (const [sq, el] of this.pieceElements) {
      const piece = wanted.get(sq);
      if (piece !== undefined && Number(el.dataset.piece) === piece) {
        wanted.delete(sq);
        this.place(el, sq);
      } else {
        unmatchedOld.set(sq, el);
        this.pieceElements.delete(sq);
      }
    }
    for (const [sq, piece] of wanted) {
      const candidates = [...unmatchedOld].filter(([, el]) => Number(el.dataset.piece) === piece);
      const promotedPawn =
        pieceTypeOf(piece) === PAWN
          ? []
          : [...unmatchedOld].filter(([, el]) => Number(el.dataset.piece) === makePiece(PAWN, pieceColorOf(piece)));
      const source = candidates.length === 1 ? candidates[0] : promotedPawn.length === 1 ? promotedPawn[0] : null;
      if (source !== null) {
        const [oldSq, el] = source;
        unmatchedOld.delete(oldSq);
        if (Number(el.dataset.piece) !== piece) this.setPiece(el, piece);
        this.pieceElements.set(sq, el);
        this.place(el, sq);
      } else {
        const el = document.createElement("div");
        el.className = "piece piece--enter";
        this.setPiece(el, piece);
        this.place(el, sq);
        this.piecesLayer.append(el);
        this.pieceElements.set(sq, el);
        requestAnimationFrame(() => el.classList.remove("piece--enter"));
      }
    }
    for (const el of unmatchedOld.values()) {
      el.classList.add("piece--exit");
      el.addEventListener("transitionend", () => el.remove(), { once: true });
      // Fallback for reduced-motion users, where no transition fires.
      setTimeout(() => el.remove(), 400);
    }
  }

  private setPiece(el: HTMLElement, piece: number): void {
    el.dataset.piece = String(piece);
    el.innerHTML = pieceSvg(piece);
  }

  private place(el: HTMLElement, sq: Square): void {
    const { col, row } = this.visualPosition(sq);
    el.style.transform = `translate(${col * 100}%, ${row * 100}%)`;
  }

  private select(sq: Square): boolean {
    const state = this.state;
    if (state === null) return false;
    const moves = state.legalMovesFrom(sq);
    if (moves.length === 0) return false;
    this.selected = sq;
    this.targets = moves;
    this.renderSquares();
    return true;
  }

  private deselect(): void {
    this.selected = NO_SQUARE;
    this.targets = [];
    this.renderSquares();
  }

  /** Handles a click or a drop onto `to`; returns true when the interaction is consumed. */
  private tryMove(to: Square): boolean {
    if (this.selected === NO_SQUARE) return false;
    const from = this.selected;
    const move = this.targets.find((m) => moveTo(m) === to);
    if (move === undefined) return false;
    if (movePromotion(move) !== 0) {
      this.openPromotionPicker(from, to);
      return true;
    }
    const result = this.handlers.onMove(from, to);
    this.deselect();
    return result.kind === "ok";
  }

  private readonly onSquareClick = (event: MouseEvent): void => {
    // Pointer events already handled mouse and touch; this path serves the keyboard.
    if (event.detail !== 0) return;
    const sq = this.squareFromEvent(event);
    if (sq === NO_SQUARE) return;
    this.activate(sq);
  };

  private activate(sq: Square): void {
    if (sq === this.selected) {
      this.deselect();
      return;
    }
    if (this.tryMove(sq)) return;
    if (!this.select(sq)) this.deselect();
  }

  private squareFromEvent(event: Event): Square {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return NO_SQUARE;
    const button = target.closest<HTMLButtonElement>(".square");
    if (button === null || button.dataset.square === undefined) return NO_SQUARE;
    return Number(button.dataset.square);
  }

  private squareAtPoint(x: number, y: number): Square {
    const rect = this.squaresLayer.getBoundingClientRect();
    const col = Math.floor(((x - rect.left) / rect.width) * 8);
    const row = Math.floor(((y - rect.top) / rect.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return NO_SQUARE;
    return this.squareAtIndex(row * 8 + col);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.state === null || !this.state.interactive || event.button !== 0) return;
    if (this.promotionPicker !== null) return;
    const sq = this.squareFromEvent(event);
    if (sq === NO_SQUARE) return;
    if (sq !== this.selected && this.tryMove(sq)) return;
    const wasSelected = sq === this.selected;
    if (!this.select(sq)) {
      this.deselect();
      return;
    }
    const element = this.pieceElements.get(sq);
    if (element === undefined) return;
    event.preventDefault();
    this.root.setPointerCapture(event.pointerId);
    this.drag = { from: sq, pointerId: event.pointerId, element, moved: false, wasSelected };
    element.classList.add("piece--dragging");
    this.followPointer(event);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag === null || event.pointerId !== drag.pointerId) return;
    drag.moved = true;
    this.followPointer(event);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag === null || event.pointerId !== drag.pointerId) return;
    const dropped = this.squareAtPoint(event.clientX, event.clientY);
    this.endDrag(drag);
    // A press-and-release on the piece's own square is a click: keep it selected, or toggle it off.
    if (dropped === drag.from || !drag.moved) {
      if (drag.wasSelected) this.deselect();
      return;
    }
    if (!this.tryMove(dropped)) this.deselect();
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.drag !== null && event.pointerId === this.drag.pointerId) this.endDrag(this.drag);
  };

  private followPointer(event: PointerEvent): void {
    const drag = this.drag;
    if (drag === null) return;
    const rect = this.squaresLayer.getBoundingClientRect();
    const size = rect.width / 8;
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;
    drag.element.style.transform = `translate(${x}px, ${y}px)`;
  }

  private endDrag(drag: DragState): void {
    if (this.root.hasPointerCapture(drag.pointerId)) this.root.releasePointerCapture(drag.pointerId);
    drag.element.classList.remove("piece--dragging");
    if (this.pieceElements.get(drag.from) === drag.element) this.place(drag.element, drag.from);
    this.drag = null;
  }

  private openPromotionPicker(from: Square, to: Square): void {
    this.closePromotionPicker();
    const state = this.state;
    if (state === null) return;
    const color = pieceColorOf(state.pieceAt(from));
    const picker = document.createElement("div");
    picker.className = "promotion";
    picker.setAttribute("role", "dialog");
    picker.setAttribute("aria-label", "Choose a piece to promote to");
    const { col, row } = this.visualPosition(to);
    picker.style.setProperty("--col", String(col));
    // The picker unrolls from the promotion square toward the middle of the board.
    picker.classList.add(row === 0 ? "promotion--down" : "promotion--up");
    for (const type of PROMOTION_CHOICES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "promotion__choice";
      button.setAttribute("aria-label", `Promote to ${PIECE_NAMES[type]}`);
      button.innerHTML = pieceSvg(makePiece(type, color));
      button.addEventListener("click", () => {
        this.closePromotionPicker();
        this.handlers.onMove(from, to, type);
        this.deselect();
      });
      picker.append(button);
    }
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "promotion__cancel";
    cancel.setAttribute("aria-label", "Cancel promotion");
    cancel.textContent = "×";
    cancel.addEventListener("click", () => {
      this.closePromotionPicker();
      this.deselect();
    });
    picker.append(cancel);
    this.root.append(picker);
    this.promotionPicker = picker;
    picker.querySelector("button")?.focus();
  }

  private closePromotionPicker(): void {
    this.promotionPicker?.remove();
    this.promotionPicker = null;
  }
}
