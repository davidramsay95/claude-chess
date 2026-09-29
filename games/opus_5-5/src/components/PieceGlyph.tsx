import type { CSSProperties } from "react";
import type { PieceSymbol, Side } from "@/chess/game";

// Written out in full so Tailwind can find every class when it scans the source.
const PIECE_IMAGES: Record<`${Side}${PieceSymbol}`, string> = {
  wp: "bg-[url(/pieces/wp.svg)]",
  wn: "bg-[url(/pieces/wn.svg)]",
  wb: "bg-[url(/pieces/wb.svg)]",
  wr: "bg-[url(/pieces/wr.svg)]",
  wq: "bg-[url(/pieces/wq.svg)]",
  wk: "bg-[url(/pieces/wk.svg)]",
  bp: "bg-[url(/pieces/bp.svg)]",
  bn: "bg-[url(/pieces/bn.svg)]",
  bb: "bg-[url(/pieces/bb.svg)]",
  br: "bg-[url(/pieces/br.svg)]",
  bq: "bg-[url(/pieces/bq.svg)]",
  bk: "bg-[url(/pieces/bk.svg)]",
};

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
    style={style}
    className={`block bg-contain bg-center bg-no-repeat ${PIECE_IMAGES[`${color}${type}`]} ${className}`}
  />
);
