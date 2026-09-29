import { type Move, moveFrom, moveTo } from "../engine/move";
import type { Position } from "../engine/position";
import { EMPTY, FILES, RANKS, squareOf, squareToName } from "../engine/types";
import { pieceLabel, pieceSvg } from "./pieces";

export interface BoardView {
  position: Position;
  flipped: boolean;
  selected: number | null;
  /** Legal moves from the selected square. */
  targets: readonly Move[];
  lastMove: Move | null;
  /** King square to mark when in check. */
  checkSquare: number | null;
  interactive: boolean;
}

export interface BoardHandlers {
  onSquareClick(square: number): void;
  onDrop(from: number, to: number): void;
}

export interface Board {
  render(view: BoardView): void;
}

const DRAG_THRESHOLD_PX = 6;

interface DragState {
  pointerId: number;
  from: number;
  startX: number;
  startY: number;
  ghost: HTMLElement | null;
}

/** Builds the 64 squares once and repaints them on every render. */
export const createBoard = (container: HTMLElement, handlers: BoardHandlers): Board => {
  container.classList.add("board");
  const squares = new Map<number, HTMLElement>();
  let view: BoardView | null = null;
  let drag: DragState | null = null;

  const squareAtPoint = (x: number, y: number): number | null => {
    const element = document.elementFromPoint(x, y);
    const squareElement = element?.closest<HTMLElement>("[data-square]");
    if (!squareElement) return null;
    const value = Number(squareElement.dataset.square);
    return Number.isInteger(value) ? value : null;
  };

  const endDrag = (): void => {
    if (!drag) return;
    drag.ghost?.remove();
    const origin = squares.get(drag.from);
    origin?.classList.remove("dragging");
    drag = null;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (!view?.interactive || event.button !== 0) return;
    const square = squareAtPoint(event.clientX, event.clientY);
    if (square === null) return;
    const piece = view.position.pieceAt(square);
    const ownPiece = piece !== EMPTY && (piece >> 3) === view.position.sideToMove;
    if (!ownPiece) {
      handlers.onSquareClick(square);
      return;
    }
    drag = { pointerId: event.pointerId, from: square, startX: event.clientX, startY: event.clientY, ghost: null };
    container.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId || !view) return;
    if (!drag.ghost) {
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (distance < DRAG_THRESHOLD_PX) return;
      const origin = squares.get(drag.from);
      const size = origin?.getBoundingClientRect().width ?? 48;
      const ghost = document.createElement("div");
      ghost.className = "drag-ghost";
      ghost.style.width = `${size}px`;
      ghost.style.height = `${size}px`;
      ghost.innerHTML = pieceSvg(view.position.pieceAt(drag.from));
      document.body.append(ghost);
      origin?.classList.add("dragging");
      drag.ghost = ghost;
      handlers.onSquareClick(drag.from);
    }
    drag.ghost.style.transform = `translate(${event.clientX}px, ${event.clientY}px) translate(-50%, -50%)`;
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const wasDragging = drag.ghost !== null;
    const from = drag.from;
    endDrag();
    if (!wasDragging) {
      handlers.onSquareClick(from);
      return;
    }
    const to = squareAtPoint(event.clientX, event.clientY);
    if (to !== null && to !== from) handlers.onDrop(from, to);
  };

  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("pointermove", onPointerMove);
  container.addEventListener("pointerup", onPointerUp);
  container.addEventListener("pointercancel", endDrag);

  const build = (flipped: boolean): void => {
    container.replaceChildren();
    squares.clear();
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const rank = flipped ? row : 7 - row;
        const file = flipped ? 7 - col : col;
        const square = squareOf(file, rank);
        const cell = document.createElement("div");
        cell.className = `square ${(file + rank) % 2 === 0 ? "dark" : "light"}`;
        cell.dataset.square = String(square);
        if (col === 0) {
          const label = document.createElement("span");
          label.className = "coord rank";
          label.textContent = RANKS[rank] ?? "";
          cell.append(label);
        }
        if (row === 7) {
          const label = document.createElement("span");
          label.className = "coord file";
          label.textContent = FILES[file] ?? "";
          cell.append(label);
        }
        const piece = document.createElement("div");
        piece.className = "piece";
        cell.append(piece);
        const marker = document.createElement("div");
        marker.className = "marker";
        cell.append(marker);
        container.append(cell);
        squares.set(square, cell);
      }
    }
  };

  let builtFlipped: boolean | null = null;

  const render = (next: BoardView): void => {
    view = next;
    if (builtFlipped !== next.flipped) {
      build(next.flipped);
      builtFlipped = next.flipped;
    }
    const targetSquares = new Map<number, boolean>();
    for (const move of next.targets) {
      targetSquares.set(moveTo(move), next.position.pieceAt(moveTo(move)) !== EMPTY);
    }
    const lastFrom = next.lastMove === null ? -1 : moveFrom(next.lastMove);
    const lastTo = next.lastMove === null ? -1 : moveTo(next.lastMove);
    for (const [square, cell] of squares) {
      const piece = next.position.pieceAt(square);
      const pieceElement = cell.querySelector<HTMLElement>(".piece");
      if (pieceElement) {
        const key = String(piece);
        if (pieceElement.dataset.piece !== key) {
          pieceElement.dataset.piece = key;
          pieceElement.innerHTML = piece === EMPTY ? "" : pieceSvg(piece);
        }
      }
      cell.setAttribute("aria-label", piece === EMPTY ? squareToName(square) : `${pieceLabel(piece)} on ${squareToName(square)}`);
      cell.classList.toggle("selected", next.selected === square);
      cell.classList.toggle("last-move", square === lastFrom || square === lastTo);
      cell.classList.toggle("in-check", next.checkSquare === square);
      const target = targetSquares.get(square);
      cell.classList.toggle("target", target === false);
      cell.classList.toggle("capture", target === true);
    }
    container.classList.toggle("locked", !next.interactive);
  };

  return { render };
};
