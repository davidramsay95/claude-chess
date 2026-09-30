import type { Piece } from "./engine/types.js";

/**
 * Piece glyphs drawn from scratch as SVG shapes (no external files, no font glyphs).
 * The style is a simple silhouette on a 100x100 viewBox, with a small internal
 * highlight line so shapes read at any size.
 *
 * Colors are chosen so both sides read on either board color:
 *   white pieces: light ivory fill with a thin dark outline
 *   black pieces: near-black fill with a thin light outline
 */

interface Palette { fill: string; stroke: string; detail: string; }

function palette(white: boolean): Palette {
  return white
    ? { fill: "#f4ecd8", stroke: "#1c1a17", detail: "#7a5a2c" }
    : { fill: "#1c1a17", stroke: "#f4ecd8", detail: "#c4a26a" };
}

// Common base disc for every piece so they sit on the square nicely.
function base(pal: Palette): string {
  return `
    <ellipse cx="50" cy="90" rx="30" ry="6" fill="${pal.stroke}" opacity="0.35"/>
    <path d="M22 88 Q22 82 30 80 L70 80 Q78 82 78 88 Q78 92 70 92 L30 92 Q22 92 22 88 Z"
          fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="2"/>
    <line x1="30" y1="82" x2="70" y2="82" stroke="${pal.stroke}" stroke-width="1" opacity="0.5"/>
  `;
}

function pawnBody(pal: Palette): string {
  return `
    ${base(pal)}
    <path d="M50 20 Q60 20 60 30 Q60 36 55 40 Q65 45 65 55 L58 78 L42 78 L35 55 Q35 45 45 40 Q40 36 40 30 Q40 20 50 20 Z"
          fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="50" cy="30" r="9" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="2"/>
  `;
}

function rookBody(pal: Palette): string {
  return `
    ${base(pal)}
    <path d="M28 22 L28 32 L36 32 L36 26 L44 26 L44 32 L56 32 L56 26 L64 26 L64 32 L72 32 L72 22 Z
             M30 32 L32 44 L28 68 L36 78 L64 78 L72 68 L68 44 L70 32 Z"
          fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="2" stroke-linejoin="round"/>
    <line x1="32" y1="44" x2="68" y2="44" stroke="${pal.stroke}" stroke-width="2"/>
    <line x1="30" y1="68" x2="70" y2="68" stroke="${pal.stroke}" stroke-width="2"/>
  `;
}

function knightBody(pal: Palette): string {
  return `
    ${base(pal)}
    <path d="M32 78 L32 68 Q30 60 34 52 Q36 46 42 42 Q40 36 44 30 Q46 22 54 20
             Q64 20 68 30 Q72 40 68 50 L72 52 L72 62 L68 62 L68 78 Z"
          fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M50 32 Q46 38 44 44" fill="none" stroke="${pal.stroke}" stroke-width="1.5" opacity="0.7"/>
    <circle cx="58" cy="34" r="1.8" fill="${pal.stroke}"/>
    <path d="M42 42 Q38 44 36 48" fill="none" stroke="${pal.stroke}" stroke-width="1.5" opacity="0.7"/>
  `;
}

function bishopBody(pal: Palette): string {
  return `
    ${base(pal)}
    <path d="M50 14 Q46 18 50 22 Q54 18 50 14 Z" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="2"/>
    <path d="M42 26 Q38 40 40 52 Q38 58 34 62 L34 68 L66 68 L66 62 Q62 58 60 52 Q62 40 58 26
             Q54 22 50 22 Q46 22 42 26 Z"
          fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M46 36 L54 36 M50 32 L50 40" stroke="${pal.stroke}" stroke-width="1.8"/>
    <path d="M32 72 Q50 68 68 72 L68 78 L32 78 Z" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="2"/>
  `;
}

function queenBody(pal: Palette): string {
  return `
    ${base(pal)}
    <circle cx="26" cy="20" r="3.4" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="1.5"/>
    <circle cx="50" cy="14" r="3.6" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="1.5"/>
    <circle cx="74" cy="20" r="3.4" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="1.5"/>
    <circle cx="36" cy="22" r="3" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="1.5"/>
    <circle cx="64" cy="22" r="3" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="1.5"/>
    <path d="M26 22 L34 46 L50 34 L66 46 L74 22 L70 44 L64 58 L36 58 L30 44 Z"
          fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M34 58 L30 68 L70 68 L66 58 Z" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="2"/>
    <path d="M30 68 L26 78 L74 78 L70 68 Z" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="2"/>
    <line x1="36" y1="62" x2="64" y2="62" stroke="${pal.stroke}" stroke-width="1.5" opacity="0.6"/>
  `;
}

function kingBody(pal: Palette): string {
  return `
    ${base(pal)}
    <path d="M46 8 L54 8 L54 14 L60 14 L60 20 L54 20 L54 30 L46 30 L46 20 L40 20 L40 14 L46 14 Z"
          fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M30 34 Q50 22 70 34 L66 56 L34 56 Z"
          fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M32 56 L30 68 L70 68 L68 56 Z" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="2"/>
    <path d="M28 68 L24 78 L76 78 L72 68 Z" fill="${pal.fill}" stroke="${pal.stroke}" stroke-width="2"/>
    <line x1="34" y1="62" x2="66" y2="62" stroke="${pal.stroke}" stroke-width="1.5" opacity="0.6"/>
  `;
}

const BODIES: Record<string, (pal: Palette) => string> = {
  p: pawnBody,
  r: rookBody,
  n: knightBody,
  b: bishopBody,
  q: queenBody,
  k: kingBody,
};

/** Return an inline SVG string for the given piece. */
export function pieceSvg(p: Piece, size = 64): string {
  const white = p === p.toUpperCase();
  const t = p.toLowerCase();
  const pal = palette(white);
  const body = BODIES[t](pal);
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
  ${body}
</svg>`.trim();
}

export function pieceSvgDataUri(p: Piece, size = 64): string {
  const svg = pieceSvg(p, size);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
