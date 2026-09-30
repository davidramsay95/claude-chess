/**
 * Hand-drawn Staunton-style piece artwork as inline SVG. No external files;
 * every piece is a set of paths on a 45x45 viewBox.
 */
import { BISHOP, KING, KNIGHT, PAWN, QUEEN, ROOK, WHITE, type ColorIndex } from "../engine/board";

interface PieceStyle {
  fill: string;
  stroke: string;
  detail: string;
}

const STYLES: Record<ColorIndex, PieceStyle> = {
  0: { fill: "#F4EBD9", stroke: "#33291E", detail: "#33291E" },
  1: { fill: "#2E2B28", stroke: "#14110E", detail: "#CDC3AC" }
};

/** Shared plinth so all pieces sit on the same footing. */
const BASE = "M 11.5 38.5 H 33.5 Q 34.5 35 30.5 33.5 H 14.5 Q 10.5 35 11.5 38.5 Z";

const bodies: Record<number, (s: PieceStyle) => string> = {
  [PAWN]: (s) => `
    <circle cx="22.5" cy="12.5" r="5.6" fill="${s.fill}"/>
    <path d="M 17.5 21.5 Q 22.5 18.5 27.5 21.5 L 29.5 33.5 H 15.5 Z" fill="${s.fill}"/>
    <path d="M 16.4 20.6 H 28.6 Q 30 19.4 28.6 18.2 H 16.4 Q 15 19.4 16.4 20.6 Z" fill="${s.fill}"/>
  `,
  [ROOK]: (s) => `
    <path d="M 13.5 8.5 H 17.5 V 12 H 20.6 V 8.5 H 24.4 V 12 H 27.5 V 8.5 H 31.5 V 16
             L 28.5 18.5 L 28.5 31 L 31 33.5 H 14 L 16.5 31 L 16.5 18.5 L 13.5 16 Z" fill="${s.fill}"/>
    <path d="M 16.5 18.5 H 28.5 M 16.5 31 H 28.5" stroke-width="1.1"/>
  `,
  [KNIGHT]: (s) => `
    <path d="M 15 38.5 C 15 30 17.5 27.5 20 24.5 C 17 26.5 13.6 25.6 12.4 22.6
             C 11.8 21 12.6 19.6 14 18.4 C 15.4 17.2 16.6 16.4 17.4 14.6
             L 18.6 10.5 L 21 13.2 C 26 13.6 31.5 17.5 32 26 C 32.3 31 31.5 35 31 38.5 Z"
          fill="${s.fill}"/>
    <path d="M 18.9 12.6 L 20.6 9.2 L 21.6 13.3 Z" fill="${s.fill}"/>
    <circle cx="18.6" cy="17.6" r="1" fill="${s.detail}" stroke="none"/>
    <path d="M 13.6 21.9 L 15.8 20.5" stroke="${s.detail}" stroke-width="1"/>
  `,
  [BISHOP]: (s) => `
    <circle cx="22.5" cy="8" r="2" fill="${s.fill}"/>
    <path d="M 22.5 11 C 27 13.5 29.5 17.5 29.5 21.5 C 29.5 25.5 26.5 28 22.5 28
             C 18.5 28 15.5 25.5 15.5 21.5 C 15.5 17.5 18 13.5 22.5 11 Z" fill="${s.fill}"/>
    <path d="M 22.5 15.5 V 23 M 19 19.2 H 26" stroke="${s.detail}" stroke-width="1.4"/>
    <path d="M 17.5 30.5 Q 22.5 28.5 27.5 30.5 L 28.8 33.5 H 16.2 Z" fill="${s.fill}"/>
  `,
  [QUEEN]: (s) => `
    <circle cx="8.5" cy="13" r="1.7" fill="${s.fill}"/>
    <circle cx="15.5" cy="9.5" r="1.7" fill="${s.fill}"/>
    <circle cx="22.5" cy="8.5" r="1.7" fill="${s.fill}"/>
    <circle cx="29.5" cy="9.5" r="1.7" fill="${s.fill}"/>
    <circle cx="36.5" cy="13" r="1.7" fill="${s.fill}"/>
    <path d="M 10 15 L 14.5 25 L 16 10.8 L 20.5 24 L 22.5 10 L 24.5 24 L 29 10.8
             L 30.5 25 L 35 15 L 32.5 30 H 12.5 Z" fill="${s.fill}"/>
    <path d="M 12.5 30.5 H 32.5 L 31 33.5 H 14 Z" fill="${s.fill}"/>
  `,
  [KING]: (s) => `
    <path d="M 22.5 4.8 V 10.6 M 19.8 7.4 H 25.2" stroke-width="1.9"/>
    <path d="M 16.6 24.5 C 12.6 17.5 16.1 11.8 22.5 11.8 C 28.9 11.8 32.4 17.5 28.4 24.5 Z"
          fill="${s.fill}"/>
    <path d="M 17.5 21.5 H 27.5" stroke="${s.detail}" stroke-width="1.1"/>
    <path d="M 15.8 26.5 Q 22.5 23.8 29.2 26.5 L 30.6 33.5 H 14.4 Z" fill="${s.fill}"/>
    <path d="M 16.6 29.5 Q 22.5 26.9 28.4 29.5" stroke="${s.detail}" stroke-width="1.1"/>
  `
};

/** Returns a full inline <svg> element string for a piece. */
export const pieceSvg = (type: number, color: ColorIndex): string => {
  const style = STYLES[color];
  const body = bodies[type];
  if (!body) return "";
  return `<svg viewBox="0 0 45 45" role="img" aria-hidden="true" focusable="false">
    <g stroke="${style.stroke}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" fill="none">
      ${body(style)}
      <path d="${BASE}" fill="${style.fill}"/>
    </g>
  </svg>`;
};

export const PIECE_NAMES: Record<number, string> = {
  [PAWN]: "pawn",
  [KNIGHT]: "knight",
  [BISHOP]: "bishop",
  [ROOK]: "rook",
  [QUEEN]: "queen",
  [KING]: "king"
};

export const colorName = (color: ColorIndex): string => (color === WHITE ? "white" : "black");
