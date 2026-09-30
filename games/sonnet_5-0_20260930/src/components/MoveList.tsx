import type { JSX } from "react";
import type { MoveRecord } from "../lib/gameRecord";

interface MoveListProps {
  moves: readonly MoveRecord[];
}

interface MovePair {
  number: number;
  white?: string;
  black?: string;
}

function pairMoves(moves: readonly MoveRecord[]): MovePair[] {
  const pairs: MovePair[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({
      number: i / 2 + 1,
      white: moves[i]?.san,
      black: moves[i + 1]?.san,
    });
  }
  return pairs;
}

export function MoveList({ moves }: MoveListProps): JSX.Element {
  const pairs = pairMoves(moves);

  return (
    <div className="move-list" aria-label="Move list">
      {pairs.length === 0 ? (
        <p className="move-list__empty">No moves played yet.</p>
      ) : (
        <ol className="move-list__pairs">
          {pairs.map((pair) => (
            <li key={pair.number} className="move-list__pair">
              <span className="move-list__number">{pair.number}.</span>
              <span className="move-list__move">{pair.white}</span>
              <span className="move-list__move">{pair.black ?? ""}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
