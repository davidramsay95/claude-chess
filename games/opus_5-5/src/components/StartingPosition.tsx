import { ChessGame } from "@/chess/game";
import { Board } from "./Board";
import { BoardFrame } from "./BoardFrame";
import type { TargetKind } from "./BoardSquare";

const STARTING_PIECES = new ChessGame().pieces();
const noMoves: ReadonlyMap<string, TargetKind> = new Map();
const never = (): boolean => false;
const ignore = (): void => {};

/** A still life of the starting position beside the form on wide screens; purely decorative. */
export const StartingPosition = (): React.JSX.Element => (
  <div aria-hidden inert className="hidden w-[min(calc(100dvh-10rem),40rem)] shrink-0 lg:block">
    <BoardFrame>
      <Board
        pieces={STARTING_PIECES}
        orientation="w"
        selected={null}
        targets={noMoves}
        lastMove={undefined}
        checkedSquare={null}
        canDrag={never}
        onSquareClick={ignore}
        onDragStart={ignore}
        onDrop={ignore}
      />
    </BoardFrame>
  </div>
);
