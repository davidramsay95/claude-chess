import { type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useRef, useState } from "react";
import type { Side } from "@/chess/game";
import { type Point, squareAtPoint } from "@/ui/board";

/** Pointer travel before a press becomes a drag, so a slightly shaky click still counts as a click. */
const DRAG_THRESHOLD_PX = 4;

interface DragSession {
  from: string;
  pointerId: number;
  origin: Point;
  offset: Point;
  active: boolean;
}

export interface DraggedPiece {
  square: string;
  offset: Point;
}

interface PieceDragOptions {
  boardRef: RefObject<HTMLElement | null>;
  orientation: Side;
  canDrag: (square: string) => boolean;
  onDragStart: (square: string) => void;
  onDrop: (from: string, to: string) => void;
}

export interface PieceDrag {
  dragged: DraggedPiece | null;
  startDrag: (square: string, event: ReactPointerEvent) => void;
  /** True when a click is the tail end of a drag and should be ignored. */
  consumeClick: () => boolean;
}

/** Drag-and-drop for pieces using pointer events, so mouse, pen and touch all behave the same. */
export const usePieceDrag = ({ boardRef, orientation, canDrag, onDragStart, onDrop }: PieceDragOptions): PieceDrag => {
  const [session, setSession] = useState<DragSession | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    if (!session) return;

    const handleMove = (event: PointerEvent): void => {
      if (event.pointerId !== session.pointerId) return;
      const offset = { x: event.clientX - session.origin.x, y: event.clientY - session.origin.y };
      const active = session.active || Math.hypot(offset.x, offset.y) > DRAG_THRESHOLD_PX;
      if (active && !session.active) onDragStart(session.from);
      setSession({ ...session, offset, active });
    };

    const handleUp = (event: PointerEvent): void => {
      if (event.pointerId !== session.pointerId) return;
      setSession(null);
      if (!session.active) return;
      suppressClickRef.current = true;
      // Browsers may or may not fire a click after a drag, so never let the flag outlive this gesture.
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      const rect = boardRef.current?.getBoundingClientRect();
      const target = rect ? squareAtPoint({ x: event.clientX, y: event.clientY }, rect, orientation) : null;
      if (target && target !== session.from) onDrop(session.from, target);
    };

    const handleCancel = (): void => setSession(null);

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
    };
  }, [session, boardRef, orientation, onDragStart, onDrop]);

  return {
    dragged: session?.active ? { square: session.from, offset: session.offset } : null,
    startDrag: (square, event) => {
      if (event.button !== 0 || !canDrag(square)) return;
      suppressClickRef.current = false;
      setSession({
        from: square,
        pointerId: event.pointerId,
        origin: { x: event.clientX, y: event.clientY },
        offset: { x: 0, y: 0 },
        active: false,
      });
    },
    consumeClick: () => {
      const suppressed = suppressClickRef.current;
      suppressClickRef.current = false;
      return suppressed;
    },
  };
};
