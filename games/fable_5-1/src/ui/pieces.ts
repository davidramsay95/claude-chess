import { BISHOP, KING, KNIGHT, PAWN, QUEEN, ROOK, WHITE, pieceColorOf, pieceTypeOf } from "../engine/types.ts";

interface Palette {
  fill: string;
  stroke: string;
  detail: string;
  strokeWidth: number;
}

/**
 * White pieces are cream with a dark outline; black pieces are near-black with a thin
 * parchment outline. Each therefore reads on both square colours without a drop shadow.
 */
const PALETTES: readonly [Palette, Palette] = [
  { fill: "#f4ead6", stroke: "#2a1d15", detail: "#2a1d15", strokeWidth: 1.4 },
  { fill: "#2a1d15", stroke: "#e2cfa8", detail: "#e2cfa8", strokeWidth: 1.1 },
];

const BASE = "M12 35.5h21c1.4 0 2.5 1.1 2.5 2.5v.5c0 1.1-.9 2-2 2H11.5c-1.1 0-2-.9-2-2V38c0-1.4 1.1-2.5 2.5-2.5z";

const COLLAR = (y: number, x1: number, x2: number): string =>
  `M${x1} ${y}h${x2 - x1}c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5H${x1}c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5z`;

const pawn = (): string => `
  <circle cx="22.5" cy="12" r="4.6"/>
  <path d="M20.5 16h4l1 3.5h-6z"/>
  <path d="${COLLAR(19.5, 16.5, 28.5)}"/>
  <path d="M19 22.5h7c.5 4.5 2.5 8.5 5 11.5v1.5H14V34c2.5-3 4.5-7 5-11.5z"/>
  <path d="${BASE}"/>`;

const rook = (): string => `
  <path d="M12.5 9h4.5v4h3.5V9h4v4H28V9h4.5v7.5h-20z"/>
  <path d="M14.5 16.5l2 3v11l-2.5 3v2h17v-2l-2.5-3v-11l2-3z"/>
  <path d="${BASE}"/>`;

const bishop = (detail: string): string => `
  <circle cx="22.5" cy="7" r="2.2"/>
  <path d="M22.5 9.5c-4.5 3.5-7 7.5-7 11.5 0 3.2 1.8 5.4 4 6.5h6c2.2-1.1 4-3.3 4-6.5 0-4-2.5-8-7-11.5z"/>
  <path d="M20.5 21l5-5" fill="none" stroke="${detail}" stroke-width="1.8" stroke-linecap="round"/>
  <path d="${COLLAR(27.5, 17, 28)}"/>
  <path d="M18.5 30.5h8l3.5 5H15z"/>
  <path d="${BASE}"/>`;

const knight = (detail: string): string => `
  <path d="M13.5 35.5c0-7 3.5-11 7.5-13.5l-6.5 1.5c-2.5.5-3.5-1.5-2.5-3 1-1.5 3-3.5 5.5-5 1.2-1.5 2.5-3.5 4.5-5l1-3.5 2 3 2-3 .5 4c4.5 3.5 5 12 4.5 24.5z"/>
  <circle cx="20.5" cy="15" r="1.3" fill="${detail}" stroke="none"/>
  <circle cx="13" cy="21.3" r=".9" fill="${detail}" stroke="none"/>
  <path d="M26.5 14c2.5 5 3.5 11 3 19" fill="none" stroke="${detail}" stroke-width="1" stroke-linecap="round" opacity=".5"/>
  <path d="${BASE}"/>`;

const queen = (): string => `
  <circle cx="11" cy="10.5" r="1.8"/>
  <circle cx="16.5" cy="7.5" r="1.8"/>
  <circle cx="22.5" cy="6.5" r="1.8"/>
  <circle cx="28.5" cy="7.5" r="1.8"/>
  <circle cx="34" cy="10.5" r="1.8"/>
  <path d="M14 27L11 12l4.5 9 1-12 3.5 12 2.5-13 2.5 13 3.5-12 1 12 4.5-9-3 15z"/>
  <path d="M13.5 27h18l1 3-1.5 2.5H14L12.5 30z"/>
  <path d="M15 32.5h15l3 3H12z"/>
  <path d="${BASE}"/>`;

const king = (detail: string): string => `
  <path d="M21.2 3h2.6v3.2H27v2.6h-3.2V12h-2.6V8.8H18V6.2h3.2z"/>
  <path d="M22.5 12.5c-3.5 0-9 2-9 7.5 0 3 2 5 4 6h10c2-1 4-3 4-6 0-5.5-5.5-7.5-9-7.5z"/>
  <path d="M22.5 14.5v9.5" fill="none" stroke="${detail}" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M13.5 26h18l1 3.5-1.5 3H14l-1.5-3z"/>
  <path d="M15 32.5h15l3 3H12z"/>
  <path d="${BASE}"/>`;

const bodyFor = (type: number, detail: string): string => {
  switch (type) {
    case PAWN:
      return pawn();
    case KNIGHT:
      return knight(detail);
    case BISHOP:
      return bishop(detail);
    case ROOK:
      return rook();
    case QUEEN:
      return queen();
    case KING:
      return king(detail);
    default:
      throw new Error(`Unknown piece type: ${type}`);
  }
};

/** Inline SVG markup for a piece code from the engine (type | colour << 3). */
export const pieceSvg = (piece: number): string => {
  const palette = PALETTES[pieceColorOf(piece) === WHITE ? 0 : 1];
  return `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <g fill="${palette.fill}" stroke="${palette.stroke}" stroke-width="${palette.strokeWidth}" stroke-linejoin="round" stroke-linecap="round">${bodyFor(
    pieceTypeOf(piece),
    palette.detail,
  )}
  </g>
</svg>`;
};
