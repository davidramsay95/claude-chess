import { useEffect, useRef } from "react";
import type { PromotionSymbol, Side } from "@/chess/game";
import { PieceGlyph } from "./PieceGlyph";

const CHOICES: readonly { type: PromotionSymbol; name: string }[] = [
  { type: "q", name: "Queen" },
  { type: "r", name: "Rook" },
  { type: "b", name: "Bishop" },
  { type: "n", name: "Knight" },
];

interface PromotionPickerProps {
  color: Side;
  onChoose: (piece: PromotionSymbol) => void;
  onCancel: () => void;
}

/** Asks which piece a pawn becomes, laid over the board so the position stays in view. */
export const PromotionPicker = ({ color, onChoose, onCancel }: PromotionPickerProps): React.JSX.Element => {
  const firstChoiceRef = useRef<HTMLButtonElement>(null);

  useEffect(() => firstChoiceRef.current?.focus(), []);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink/45 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="promotion-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
        className="w-full max-w-sm rounded-lg border border-walnut-edge bg-ink-raised p-4 shadow-[0_18px_40px_rgba(0,0,0,0.5)]"
      >
        <h2 id="promotion-title" className="font-display text-lg text-parchment">
          Promote pawn to
        </h2>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {CHOICES.map((choice, index) => (
            <button
              key={choice.type}
              ref={index === 0 ? firstChoiceRef : undefined}
              type="button"
              aria-label={choice.name}
              onClick={() => onChoose(choice.type)}
              className="group flex flex-col items-center gap-1 rounded-md bg-square-light p-1.5 text-xs font-medium text-walnut transition-colors hover:bg-brass-bright focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brass-bright"
            >
              <PieceGlyph color={color} type={choice.type} className="aspect-square w-full" />
              <span aria-hidden>{choice.name}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 w-full rounded-md px-3 py-2 text-sm text-muted transition-colors hover:text-parchment focus-visible:outline-2 focus-visible:outline-brass-bright"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
