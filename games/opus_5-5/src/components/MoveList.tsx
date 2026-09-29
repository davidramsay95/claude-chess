import { useEffect, useRef } from "react";
import { toMovePairs } from "@/ui/moveList";

interface MoveListProps {
  sans: readonly string[];
}

/** Numbered move pairs in SAN, kept scrolled to the latest move. */
export const MoveList = ({ sans }: MoveListProps): React.JSX.Element => {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scrollerRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [sans.length]);

  if (sans.length === 0) {
    return <p className="px-1 py-3 text-sm text-muted">Moves will be listed here.</p>;
  }

  return (
    <div ref={scrollerRef} className="max-h-48 overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
      <ol aria-label="Moves" className="grid grid-cols-[2.5rem_1fr_1fr] text-sm tabular-nums">
        {toMovePairs(sans).map((pair, index) => (
          <li
            key={pair.number}
            className={`col-span-3 grid grid-cols-subgrid rounded-sm px-1 py-1 ${index % 2 === 1 ? "bg-white/[0.03]" : ""}`}
          >
            <span className="text-muted">{pair.number}.</span>
            <span className={index * 2 === sans.length - 1 ? "font-semibold text-brass-bright" : ""}>{pair.white}</span>
            <span className={index * 2 + 1 === sans.length - 1 ? "font-semibold text-brass-bright" : ""}>
              {pair.black ?? ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
};
