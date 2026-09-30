import React from "react";
import { PlayerColor } from "../types.js";
import { QUEEN, ROOK, BISHOP, KNIGHT } from "../engine/index.js";
import {
  WQueen, WRook, WBishop, WKnight,
  BQueen, BRook, BBishop, BKnight,
} from "../pieces.js";

interface PromotionDialogProps {
  playerColor: PlayerColor;
  onSelect: (pieceType: number) => void;
  onCancel: () => void;
}

export function PromotionDialog({ playerColor, onSelect, onCancel }: PromotionDialogProps) {
  const pieces = [QUEEN, ROOK, BISHOP, KNIGHT];
  const isWhite = playerColor === "white";

  return (
    <div className="promotion-overlay" onClick={onCancel}>
      <div className="promotion-dialog" onClick={(e) => e.stopPropagation()}>
        <p className="promotion-title">Choose promotion piece</p>
        <div className="promotion-choices">
          {pieces.map((pt) => (
            <button key={pt} className="promotion-choice" onClick={() => onSelect(pt)}>
              {isWhite
                ? (pt === QUEEN ? <WQueen size={52} /> : pt === ROOK ? <WRook size={52} /> : pt === BISHOP ? <WBishop size={52} /> : <WKnight size={52} />)
                : (pt === QUEEN ? <BQueen size={52} /> : pt === ROOK ? <BRook size={52} /> : pt === BISHOP ? <BBishop size={52} /> : <BKnight size={52} />)
              }
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
