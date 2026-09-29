import { BISHOP, KING, KNIGHT, PAWN, QUEEN, ROOK, WHITE, colorOf, typeOf } from "../engine/types";

/**
 * Original piece artwork. Each piece is a handful of paths in a 64x64 box so
 * it scales crisply from a phone to a desktop board without any image files.
 */

interface Palette {
  fill: string;
  stroke: string;
  detail: string;
}

const WHITE_PALETTE: Palette = { fill: "#f4ecd9", stroke: "#2a2019", detail: "#2a2019" };
const BLACK_PALETTE: Palette = { fill: "#2b2420", stroke: "#0d0907", detail: "#d9c8a4" };

const BASE = "M15 56 L49 56 L47 50 L17 50 Z";

const pawn = (p: Palette): string => `
  <circle cx="32" cy="19" r="7.5" fill="${p.fill}" stroke="${p.stroke}"/>
  <path d="M25 31 Q32 26 39 31 L43 46 L21 46 Z" fill="${p.fill}" stroke="${p.stroke}"/>
  <path d="${BASE}" fill="${p.fill}" stroke="${p.stroke}"/>
  <path d="M27 41 L37 41" stroke="${p.detail}" stroke-width="1.5" opacity="0.6"/>`;

const rook = (p: Palette): string => `
  <path d="M18 12 L24 12 L24 18 L29 18 L29 12 L35 12 L35 18 L40 18 L40 12 L46 12 L46 24 L18 24 Z" fill="${p.fill}" stroke="${p.stroke}"/>
  <path d="M21 24 L43 24 L41 46 L23 46 Z" fill="${p.fill}" stroke="${p.stroke}"/>
  <path d="${BASE}" fill="${p.fill}" stroke="${p.stroke}"/>
  <path d="M26 30 L38 30 M26 38 L38 38" stroke="${p.detail}" stroke-width="1.5" opacity="0.6"/>`;

const knight = (p: Palette): string => `
  <path d="M19 56 L47 56 L47 50 C47 38 45 24 34 16 L33 9 L28 15 C21 17 16 23 14 31 L12 37 L18 39 L23 33 C25 36 23 41 22 45 L19 50 Z" fill="${p.fill}" stroke="${p.stroke}"/>
  <path d="M28 15 C31 20 35 24 39 27" fill="none" stroke="${p.detail}" stroke-width="1.5" opacity="0.6"/>
  <circle cx="29" cy="24" r="1.8" fill="${p.detail}"/>
  <path d="M15 34 L18 33" stroke="${p.detail}" stroke-width="1.5" opacity="0.6"/>
  <path d="${BASE}" fill="${p.fill}" stroke="${p.stroke}"/>`;

const bishop = (p: Palette): string => `
  <circle cx="32" cy="9" r="3" fill="${p.fill}" stroke="${p.stroke}"/>
  <path d="M32 13 C41 21 44 31 42 44 L22 44 C20 31 23 21 32 13 Z" fill="${p.fill}" stroke="${p.stroke}"/>
  <path d="M35 24 L28 33" stroke="${p.detail}" stroke-width="2" opacity="0.7"/>
  <path d="M20 46 L44 46 L46 50 L18 50 Z" fill="${p.fill}" stroke="${p.stroke}"/>
  <path d="${BASE}" fill="${p.fill}" stroke="${p.stroke}"/>`;

const queen = (p: Palette): string => `
  <path d="M17 30 L14 14 L23 26 L28 9 L32 24 L36 9 L41 26 L50 14 L47 30 Z" fill="${p.fill}" stroke="${p.stroke}"/>
  <circle cx="14" cy="13" r="2.2" fill="${p.fill}" stroke="${p.stroke}"/>
  <circle cx="28" cy="8" r="2.2" fill="${p.fill}" stroke="${p.stroke}"/>
  <circle cx="36" cy="8" r="2.2" fill="${p.fill}" stroke="${p.stroke}"/>
  <circle cx="50" cy="13" r="2.2" fill="${p.fill}" stroke="${p.stroke}"/>
  <path d="M20 30 L44 30 L41 46 L23 46 Z" fill="${p.fill}" stroke="${p.stroke}"/>
  <path d="M24 38 L40 38" stroke="${p.detail}" stroke-width="1.5" opacity="0.6"/>
  <path d="${BASE}" fill="${p.fill}" stroke="${p.stroke}"/>`;

const king = (p: Palette): string => `
  <path d="M32 3 L32 14 M27 8 L37 8" stroke="${p.stroke}" stroke-width="3"/>
  <path d="M19 30 C19 20 45 20 45 30 L43 46 L21 46 Z" fill="${p.fill}" stroke="${p.stroke}"/>
  <path d="M25 22 C29 18 35 18 39 22" fill="none" stroke="${p.detail}" stroke-width="1.5" opacity="0.7"/>
  <path d="M24 38 L40 38" stroke="${p.detail}" stroke-width="1.5" opacity="0.6"/>
  <path d="M20 46 L44 46 L46 50 L18 50 Z" fill="${p.fill}" stroke="${p.stroke}"/>
  <path d="${BASE}" fill="${p.fill}" stroke="${p.stroke}"/>`;

const shapeFor = (type: number, p: Palette): string => {
  switch (type) {
    case PAWN:
      return pawn(p);
    case ROOK:
      return rook(p);
    case KNIGHT:
      return knight(p);
    case BISHOP:
      return bishop(p);
    case QUEEN:
      return queen(p);
    case KING:
      return king(p);
    default:
      return "";
  }
};

/** Full inline SVG markup for a piece code from src/engine/types.ts. */
export const pieceSvg = (piece: number): string => {
  const palette = colorOf(piece) === WHITE ? WHITE_PALETTE : BLACK_PALETTE;
  const shapes = shapeFor(typeOf(piece), palette);
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><g stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">${shapes}</g></svg>`;
};

/** Human-readable label for accessibility. */
export const pieceLabel = (piece: number): string => {
  const names: Record<number, string> = {
    [PAWN]: "pawn",
    [KNIGHT]: "knight",
    [BISHOP]: "bishop",
    [ROOK]: "rook",
    [QUEEN]: "queen",
    [KING]: "king",
  };
  const colour = colorOf(piece) === WHITE ? "white" : "black";
  return `${colour} ${names[typeOf(piece)] ?? "piece"}`;
};
