import type { CSSProperties } from "react";
import type { PieceSymbol, Side } from "@/chess/game";

// Inlined at build time so the artwork resolves when the game is served under a sub-path.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

export const SIDE_NAMES: Record<Side, string> = { w: "white", b: "black" };

interface PieceGlyphProps {
  color: Side;
  type: PieceSymbol;
  className?: string;
  style?: CSSProperties;
}

/** Decorative piece artwork; callers describe the piece to assistive technology themselves. */
export const PieceGlyph = ({ color, type, className = "", style }: PieceGlyphProps): React.JSX.Element => (
  <span
    aria-hidden
    data-piece
    style={{ backgroundImage: `url(${BASE_PATH}/pieces/${color}${type}.svg)`, ...style }}
    className={`block bg-contain bg-center bg-no-repeat ${className}`}
  />
);
