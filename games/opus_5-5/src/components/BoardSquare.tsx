import type { PointerEvent as ReactPointerEvent } from "react";
import type { BoardPiece } from "@/chess/game";
import type { EdgeLabels, Point } from "@/ui/board";
import { PIECE_NAMES, PieceGlyph, SIDE_NAMES } from "./PieceGlyph";

export type TargetKind = "move" | "capture";

export interface BoardSquareProps {
  square: string;
  piece: BoardPiece | undefined;
  light: boolean;
  labels: EdgeLabels;
  selected: boolean;
  lastMove: boolean;
  checked: boolean;
  target: TargetKind | undefined;
  /** Pointer offset while this square's piece is being dragged. */
  dragOffset: Point | null;
  grabbable: boolean;
  onClick: (square: string) => void;
  onPointerDown: (square: string, event: ReactPointerEvent) => void;
}

const squareLabel = (square: string, piece: BoardPiece | undefined): string =>
  piece ? `${square}, ${SIDE_NAMES[piece.color]} ${PIECE_NAMES[piece.type]}` : square;

/** One square of the board, including its highlights, coordinates and piece. */
export const BoardSquare = ({
  square,
  piece,
  light,
  labels,
  selected,
  lastMove,
  checked,
  target,
  dragOffset,
  grabbable,
  onClick,
  onPointerDown,
}: BoardSquareProps): React.JSX.Element => {
  const labelColor = light ? "text-square-dark" : "text-square-light";
  return (
    <button
      type="button"
      aria-label={squareLabel(square, piece)}
      aria-pressed={selected}
      data-square={square}
      data-target={target}
      data-checked={checked || undefined}
      onClick={() => onClick(square)}
      onPointerDown={(event) => onPointerDown(square, event)}
      className={`relative aspect-square select-none outline-none focus-visible:z-20 focus-visible:ring-4 focus-visible:ring-brass-bright focus-visible:ring-inset ${
        light ? "bg-square-light" : "bg-square-dark"
      } ${dragOffset ? "z-30" : ""} ${grabbable ? "cursor-grab" : "cursor-default"} ${target ? "cursor-pointer" : ""}`}
    >
      {lastMove && <span className="absolute inset-0 bg-brass/40" />}
      {selected && <span className="absolute inset-0 bg-brass/70" />}
      {checked && (
        <span className="absolute inset-0 bg-[radial-gradient(circle,rgba(226,72,56,0.95)_0%,rgba(210,73,59,0.55)_42%,rgba(210,73,59,0)_72%)]" />
      )}
      {labels.rank && (
        <span
          className={`absolute top-[3%] left-[5%] font-sans text-[clamp(8px,1.6vw,12px)] leading-none font-semibold ${labelColor}`}
        >
          {labels.rank}
        </span>
      )}
      {labels.file && (
        <span
          className={`absolute right-[6%] bottom-[3%] font-sans text-[clamp(8px,1.6vw,12px)] leading-none font-semibold ${labelColor}`}
        >
          {labels.file}
        </span>
      )}
      {piece && (
        <PieceGlyph
          color={piece.color}
          type={piece.type}
          className={`pointer-events-none absolute inset-[4%] ${dragOffset ? "scale-110 drop-shadow-[0_6px_6px_rgba(0,0,0,0.45)]" : ""}`}
          // The drag position changes every pointer move, which Tailwind classes cannot express.
          style={dragOffset ? { translate: `${dragOffset.x}px ${dragOffset.y}px` } : undefined}
        />
      )}
      {target === "move" && <span className="absolute inset-[36%] rounded-full bg-[#1e1810]/30" />}
      {target === "capture" && (
        <span className="absolute inset-0 bg-[radial-gradient(circle,transparent_0%,transparent_78%,rgba(30,24,16,0.32)_79%)]" />
      )}
    </button>
  );
};
