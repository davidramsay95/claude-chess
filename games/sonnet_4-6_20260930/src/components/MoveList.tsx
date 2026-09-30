import React, { useEffect, useRef } from "react";
import { parseFen, moveToUci, uciToMove, makeMove, STARTING_FEN } from "../engine/index.js";
import type { BoardState } from "../engine/index.js";

interface MoveListProps {
  moves: string[];
  startFen?: string;
}

function moveToSan(uci: string, board: BoardState): string {
  // Simple UCI-to-display conversion
  // Full SAN would need disambiguation, but this gives readable output
  const move = uciToMove(uci, board);
  if (!move) return uci;
  return uci; // use UCI directly; SAN is complex to compute correctly
}

export function MoveList({ moves, startFen = STARTING_FEN }: MoveListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [moves]);

  // Pair moves into full-move rows
  const pairs: Array<{ white?: string; black?: string; num: number }> = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({ num: Math.floor(i / 2) + 1, white: moves[i], black: moves[i + 1] });
  }

  return (
    <div className="move-list-container" ref={listRef}>
      {pairs.length === 0 && <p className="move-list-empty">No moves yet</p>}
      {pairs.map((pair) => (
        <div key={pair.num} className="move-row">
          <span className="move-num">{pair.num}.</span>
          <span className="move-uci">{pair.white ?? ""}</span>
          <span className="move-uci">{pair.black ?? ""}</span>
        </div>
      ))}
    </div>
  );
}
