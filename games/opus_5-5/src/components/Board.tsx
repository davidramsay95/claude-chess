"use client";

import { type ReactNode, useEffectEvent, useLayoutEffect, useMemo, useRef } from "react";
import type { BoardPiece, Side } from "@/chess/game";
import { displaySquares, edgeLabels, isLightSquare, squareDistance } from "@/ui/board";
import { BoardSquare, type TargetKind } from "./BoardSquare";
import { usePieceDrag } from "./usePieceDrag";

const SLIDE_MS = 180;

export interface MoveSquares {
  from: string;
  to: string;
}

interface BoardProps {
  pieces: readonly BoardPiece[];
  orientation: Side;
  selected: string | null;
  targets: ReadonlyMap<string, TargetKind>;
  lastMove: MoveSquares | undefined;
  checkedSquare: string | null;
  canDrag: (square: string) => boolean;
  onSquareClick: (square: string) => void;
  onDragStart: (square: string) => void;
  onDrop: (from: string, to: string) => void;
  /** Dialogs such as the promotion picker, laid over the board. */
  children?: ReactNode;
}

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Slides the moved piece from its origin square, unless the player already carried it there by hand. */
const useMoveAnimation = (
  boardRef: React.RefObject<HTMLDivElement | null>,
  lastMove: MoveSquares | undefined,
  orientation: Side,
  droppedMoveRef: React.RefObject<MoveSquares | null>,
): void => {
  const slidePiece = useEffectEvent((move: MoveSquares | undefined) => {
    const dropped = droppedMoveRef.current;
    droppedMoveRef.current = null;
    if (!move || prefersReducedMotion()) return;
    if (dropped && dropped.from === move.from && dropped.to === move.to) return;
    const piece = boardRef.current?.querySelector<HTMLElement>(`[data-square="${move.to}"] [data-piece]`);
    // jsdom and very old browsers lack the Web Animations API; the move still shows, just without sliding.
    if (!piece || typeof piece.animate !== "function") return;
    const distance = squareDistance(move.to, move.from, orientation);
    // Percentages of the piece box, which is 92% of a square because of its inset.
    const start = `translate(${(distance.x * 100) / 0.92}%, ${(distance.y * 100) / 0.92}%)`;
    piece.animate([{ transform: start }, { transform: "none" }], {
      duration: SLIDE_MS,
      easing: "cubic-bezier(.2,.7,.3,1)",
    });
  });

  // Keyed on the move alone so flipping the board does not replay the animation.
  useLayoutEffect(() => slidePiece(lastMove), [lastMove]);
};

/** The 8x8 board: renders squares for the viewing side and turns clicks and drags into move intents. */
export const Board = ({
  pieces,
  orientation,
  selected,
  targets,
  lastMove,
  checkedSquare,
  canDrag,
  onSquareClick,
  onDragStart,
  onDrop,
  children,
}: BoardProps): React.JSX.Element => {
  const boardRef = useRef<HTMLDivElement>(null);
  const droppedMoveRef = useRef<MoveSquares | null>(null);
  const pieceAt = useMemo(() => new Map(pieces.map((piece) => [piece.square, piece])), [pieces]);
  const drag = usePieceDrag({
    boardRef,
    orientation,
    canDrag,
    onDragStart,
    onDrop: (from, to) => {
      droppedMoveRef.current = { from, to };
      onDrop(from, to);
    },
  });
  useMoveAnimation(boardRef, lastMove, orientation, droppedMoveRef);

  return (
    <div
      ref={boardRef}
      role="group"
      aria-label="Chess board"
      className="relative grid touch-none grid-cols-8 overflow-visible"
    >
      {displaySquares(orientation).map((square) => (
        <BoardSquare
          key={square}
          square={square}
          piece={pieceAt.get(square)}
          light={isLightSquare(square)}
          labels={edgeLabels(square, orientation)}
          selected={selected === square}
          lastMove={lastMove?.from === square || lastMove?.to === square}
          checked={checkedSquare === square}
          target={targets.get(square)}
          dragOffset={drag.dragged?.square === square ? drag.dragged.offset : null}
          grabbable={canDrag(square)}
          onClick={(clicked) => {
            if (!drag.consumeClick()) onSquareClick(clicked);
          }}
          onPointerDown={drag.startDrag}
        />
      ))}
      {children}
    </div>
  );
};
