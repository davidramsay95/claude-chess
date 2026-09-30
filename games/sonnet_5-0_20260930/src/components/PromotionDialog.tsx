import type { JSX } from "react";
import type { Color } from "../engine/index";
import { PieceIcon } from "./PieceIcon";

interface PromotionDialogProps {
  color: Color;
  onChoose: (piece: "q" | "r" | "b" | "n") => void;
  onCancel: () => void;
}

const CHOICES: { value: "q" | "r" | "b" | "n"; label: string }[] = [
  { value: "q", label: "Queen" },
  { value: "r", label: "Rook" },
  { value: "b", label: "Bishop" },
  { value: "n", label: "Knight" },
];

export function PromotionDialog({ color, onChoose, onCancel }: PromotionDialogProps): JSX.Element {
  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="promotion-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Choose promotion piece"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="promotion-dialog__title">Promote pawn to</h2>
        <div className="promotion-dialog__choices">
          {CHOICES.map((choice) => (
            <button
              key={choice.value}
              type="button"
              className="promotion-dialog__choice"
              onClick={() => onChoose(choice.value)}
              aria-label={choice.label}
            >
              <PieceIcon type={choice.value} color={color} />
              <span>{choice.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
