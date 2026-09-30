import type { JSX } from "react";
import { useMemo, useState } from "react";
import { getLegalMoves, isInCheck } from "../engine/index";
import type { Color, GameState, Move, Square as SquareName } from "../engine/index";
import { PieceIcon } from "./PieceIcon";

interface BoardProps {
  state: GameState;
  orientation: Color;
  /** Squares of the most recently played move, for highlighting. */
  lastMove: { from: SquareName; to: SquareName } | null;
  /** Disabled while it's the AI's turn, or the game has ended. */
  disabled: boolean;
  onMove: (move: Move) => void;
}

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

function squareToIndex(square: SquareName): number {
  const file = square.charCodeAt(0) - "a".charCodeAt(0);
  const rank = square.charCodeAt(1) - "1".charCodeAt(0);
  return rank * 8 + file;
}

function indexToSquare(rank: number, file: number): SquareName {
  return `${FILES[file]}${rank + 1}`;
}

/** True if moving the piece on `from` to `to` requires a promotion choice. */
export function needsPromotionChoice(state: GameState, from: SquareName, to: SquareName): boolean {
  const piece = state.board[squareToIndex(from)];
  if (!piece || piece.type !== "p") return false;
  const toRank = to.charCodeAt(1) - "1".charCodeAt(0);
  return toRank === 0 || toRank === 7;
}

export function Board({ state, orientation, lastMove, disabled, onMove }: BoardProps): JSX.Element {
  const [selected, setSelected] = useState<SquareName | null>(null);

  const legalMoves = useMemo(() => getLegalMoves(state), [state]);
  const destinationsFromSelected = useMemo(() => {
    if (!selected) return new Set<SquareName>();
    return new Set(legalMoves.filter((m) => m.from === selected).map((m) => m.to));
  }, [legalMoves, selected]);

  const kingInCheckSquare = useMemo(() => {
    if (!isInCheck(state, state.turn)) return null;
    for (let i = 0; i < 64; i++) {
      const piece = state.board[i];
      if (piece && piece.type === "k" && piece.color === state.turn) {
        return indexToSquare(Math.floor(i / 8), i % 8);
      }
    }
    return null;
  }, [state]);

  function handleSquareClick(square: SquareName): void {
    if (disabled) return;

    const piece = state.board[squareToIndex(square)];

    if (selected && destinationsFromSelected.has(square)) {
      onMove({ from: selected, to: square });
      setSelected(null);
      return;
    }

    if (piece && piece.color === state.turn) {
      setSelected(square === selected ? null : square);
      return;
    }

    setSelected(null);
  }

  const ranks = orientation === "white" ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const files = orientation === "white" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];

  return (
    <div className={`board${disabled ? " board--disabled" : ""}`} role="grid" aria-label="Chess board">
      {ranks.map((rank) =>
        files.map((file) => {
          const square = indexToSquare(rank, file);
          const piece = state.board[squareToIndex(square)];
          const isLight = (rank + file) % 2 === 1;
          const isSelected = selected === square;
          const isDestination = destinationsFromSelected.has(square);
          const isLastMove = lastMove !== null && (lastMove.from === square || lastMove.to === square);
          const isCheck = kingInCheckSquare === square;

          const classNames = [
            "board__square",
            isLight ? "board__square--light" : "board__square--dark",
            isSelected ? "board__square--selected" : "",
            isLastMove ? "board__square--last-move" : "",
            isCheck ? "board__square--check" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={square}
              type="button"
              className={classNames}
              onClick={() => handleSquareClick(square)}
              disabled={disabled}
              role="gridcell"
              aria-label={square + (piece ? ` ${piece.color} ${piece.type}` : "")}
            >
              {file === files[0] && (
                <span className="board__coordinate board__coordinate--rank">{rank + 1}</span>
              )}
              {rank === ranks[ranks.length - 1] && (
                <span className="board__coordinate board__coordinate--file">{FILES[file]}</span>
              )}
              {piece && <PieceIcon type={piece.type} color={piece.color} />}
              {isDestination && <span className={`board__dot${piece ? " board__dot--capture" : ""}`} />}
            </button>
          );
        }),
      )}
    </div>
  );
}
