import React, { useState, useCallback } from "react";
import { BoardState, Move } from "../engine/board.js";
import {
  squareFile, squareRank, squareIndex, squareToAlgebraic,
  WHITE, BLACK, PAWN, QUEEN,
  pieceType, pieceColor,
  generateLegalMoves,
  FLAG_CASTLE_KS, FLAG_CASTLE_QS, FLAG_EN_PASSANT,
} from "../engine/index.js";
import { PieceIcon } from "../pieces.js";
import { PlayerColor } from "../types.js";

interface BoardProps {
  board: BoardState;
  playerColor: PlayerColor;
  isPlayerTurn: boolean;
  lastMove: { from: number; to: number } | null;
  onMove: (from: number, to: number, promotion?: number) => void;
  onPromotionNeeded: (from: number, to: number) => void;
}

export function Board({
  board,
  playerColor,
  isPlayerTurn,
  lastMove,
  onMove,
  onPromotionNeeded,
}: BoardProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [legalTargets, setLegalTargets] = useState<Set<number>>(new Set());
  const [legalMovesCache, setLegalMovesCache] = useState<Move[]>([]);

  const flipped = playerColor === "black";

  const handleSquareClick = useCallback(
    (sq: number) => {
      if (!isPlayerTurn) return;

      const piece = board.squares[sq];
      const playerSide = playerColor === "white" ? WHITE : BLACK;

      if (selected === null) {
        // Select a piece
        if (piece !== 0 && pieceColor(piece) === playerSide) {
          const legal = generateLegalMoves(board);
          const targets = new Set(
            legal
              .filter((m) => m.from === sq)
              .map((m) => m.to)
          );
          setSelected(sq);
          setLegalTargets(targets);
          setLegalMovesCache(legal);
        }
      } else {
        if (sq === selected) {
          // Deselect
          setSelected(null);
          setLegalTargets(new Set());
          return;
        }

        if (legalTargets.has(sq)) {
          // Find the legal move
          const move = legalMovesCache.find((m) => m.from === selected && m.to === sq);
          if (!move) return;

          // Check if promotion
          const piece2 = board.squares[selected];
          const isPromo =
            pieceType(piece2) === PAWN &&
            ((playerSide === WHITE && squareRank(sq) === 7) ||
              (playerSide === BLACK && squareRank(sq) === 0));

          setSelected(null);
          setLegalTargets(new Set());

          if (isPromo) {
            onPromotionNeeded(selected, sq);
          } else {
            onMove(selected, sq);
          }
        } else if (piece !== 0 && pieceColor(piece) === playerSide) {
          // Re-select different piece
          const legal = generateLegalMoves(board);
          const targets = new Set(
            legal
              .filter((m) => m.from === sq)
              .map((m) => m.to)
          );
          setSelected(sq);
          setLegalTargets(targets);
          setLegalMovesCache(legal);
        } else {
          setSelected(null);
          setLegalTargets(new Set());
        }
      }
    },
    [board, selected, legalTargets, legalMovesCache, isPlayerTurn, playerColor, onMove, onPromotionNeeded]
  );

  const renderSquare = (sq: number) => {
    const r = squareRank(sq);
    const f = squareFile(sq);
    const isLight = (r + f) % 2 === 1;
    const piece = board.squares[sq];
    const isSelected = selected === sq;
    const isTarget = legalTargets.has(sq);
    const isLastFrom = lastMove?.from === sq;
    const isLastTo = lastMove?.to === sq;
    const alg = squareToAlgebraic(sq);

    const showRankLabel = flipped ? f === 7 : f === 0;
    const showFileLabel = flipped ? r === 7 : r === 0;

    return (
      <div
        key={sq}
        className={[
          "square",
          isLight ? "light" : "dark",
          isSelected ? "selected" : "",
          isTarget ? "target" : "",
          isLastFrom || isLastTo ? "last-move" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => handleSquareClick(sq)}
        data-sq={alg}
      >
        {showRankLabel && (
          <span className="rank-label">{r + 1}</span>
        )}
        {showFileLabel && (
          <span className="file-label">{String.fromCharCode(97 + f)}</span>
        )}
        {isTarget && piece === 0 && <div className="move-dot" />}
        {isTarget && piece !== 0 && <div className="capture-ring" />}
        {piece !== 0 && (
          <div className="piece-wrapper">
            <PieceIcon pieceCode={piece} size={undefined} />
          </div>
        )}
      </div>
    );
  };

  // Build ordered array of squares for rendering
  const squares: number[] = [];
  if (flipped) {
    for (let r = 0; r <= 7; r++) {
      for (let f = 7; f >= 0; f--) {
        squares.push(squareIndex(r, f));
      }
    }
  } else {
    for (let r = 7; r >= 0; r--) {
      for (let f = 0; f <= 7; f++) {
        squares.push(squareIndex(r, f));
      }
    }
  }

  return (
    <div className="board-grid">
      {squares.map((sq) => renderSquare(sq))}
    </div>
  );
}
