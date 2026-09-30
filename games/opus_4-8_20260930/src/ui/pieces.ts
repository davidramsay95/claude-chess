import { Color, PieceType, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, WHITE } from "../engine/types.ts";

/**
 * Original chess-piece artwork drawn from scratch as inline SVG primitives.
 * The markup is colour-agnostic: `.pc-body`/`.pc-line` pick up CSS variables so
 * the same shapes render as a white or black piece. Nothing here references an
 * external image or a chess font.
 */

const PAWN_SVG = `
  <circle class="pc-body" cx="22.5" cy="12.5" r="4.8"/>
  <path class="pc-body" d="M16 33 C 16 26 18.6 24.2 19.8 21.2 L 25.2 21.2 C 26.4 24.2 29 26 29 33 Z"/>
  <path class="pc-body" d="M18.4 22.2 L26.6 22.2 L25.4 19.4 L19.6 19.4 Z"/>
  <path class="pc-body" d="M13 39.5 L32 39.5 L29.5 33 L15.5 33 Z"/>
`;

const KNIGHT_SVG = `
  <path class="pc-body" d="M13 39.5 L32 39.5 L30 33 L15 33 Z"/>
  <path class="pc-body" d="M15.5 33 C 14 27 16 22 19 19.5 C 17.5 21 17 23 18 23.5
    C 19 24 20.5 22 21 20.5 C 21.5 19 20.5 17.5 22 15
    C 24 11.5 22 9.5 21 8.5 L 23 6.5 C 30 8 33 14 33 22 C 33 27 32 31 31.5 33 Z"/>
  <circle class="pc-line" cx="20.4" cy="14.6" r="1.1" style="fill:var(--piece-edge);stroke:none"/>
  <path class="pc-line" d="M25 12 C 26.5 13.5 27.5 16 27.8 19"/>
`;

const BISHOP_SVG = `
  <path class="pc-body" d="M12.5 39.5 L32.5 39.5 L30 34 L15 34 Z"/>
  <path class="pc-body" d="M16 34 C 15 30 17 28 18 27 L 27 27 C 28 28 30 30 29 34 Z"/>
  <path class="pc-body" d="M22.5 11 C 26.5 13.5 28 18.5 26.5 22.5 C 25.6 24.8 24 26 22.5 27
    C 21 26 19.4 24.8 18.5 22.5 C 17 18.5 18.5 13.5 22.5 11 Z"/>
  <circle class="pc-body" cx="22.5" cy="8.6" r="2.4"/>
  <path class="pc-line" d="M20 19 L25 19 M22.5 16.5 L22.5 21.5"/>
`;

const ROOK_SVG = `
  <path class="pc-body" d="M12 39.5 L33 39.5 L31 34 L14 34 Z"/>
  <path class="pc-body" d="M15 34 L14.5 22 L30.5 22 L30 34 Z"/>
  <path class="pc-body" d="M13.5 22 L13.5 15 L17 15 L17 18 L20.7 18 L20.7 15
    L24.3 15 L24.3 18 L28 18 L28 15 L31.5 15 L31.5 22 Z"/>
  <path class="pc-line" d="M16.5 22 L28.5 22 M16.8 34 L28.2 34"/>
`;

const QUEEN_SVG = `
  <path class="pc-body" d="M11.5 39.5 L33.5 39.5 L31.5 34 L13.5 34 Z"/>
  <path class="pc-body" d="M14 34 C 12.5 29 12.5 26 13 23.5 L 32 23.5 C 32.5 26 32.5 29 31 34 Z"/>
  <path class="pc-body" d="M12.5 24 L9.5 13 L15 20 L18.5 11.5 L22.5 20.5 L26.5 11.5
    L30 20 L35.5 13 L32.5 24 Z"/>
  <circle class="pc-body" cx="9.2" cy="12" r="2"/>
  <circle class="pc-body" cx="22.5" cy="10.2" r="2"/>
  <circle class="pc-body" cx="35.8" cy="12" r="2"/>
  <path class="pc-line" d="M14.5 28 L30.5 28"/>
`;

const KING_SVG = `
  <path class="pc-body" d="M11.5 39.5 L33.5 39.5 L31.5 34 L13.5 34 Z"/>
  <path class="pc-body" d="M14 34 C 12 29 13 25 15 23 C 18 20.5 27 20.5 30 23
    C 32 25 33 29 31 34 Z"/>
  <path class="pc-body" d="M22.5 22 C 20 18 16.5 18 15.2 20.5 C 14 23 16 25.5 22.5 27.5
    C 29 25.5 31 23 29.8 20.5 C 28.5 18 25 18 22.5 22 Z"/>
  <path class="pc-body" d="M20 10.5 L25 10.5 L25 8 L20 8 Z"/>
  <path class="pc-body" d="M21 6.5 L24 6.5 L24 13.5 L21 13.5 Z"/>
  <path class="pc-line" d="M22.5 14 L22.5 20"/>
`;

const SHAPES: Record<PieceType, string> = {
  [PAWN]: PAWN_SVG,
  [KNIGHT]: KNIGHT_SVG,
  [BISHOP]: BISHOP_SVG,
  [ROOK]: ROOK_SVG,
  [QUEEN]: QUEEN_SVG,
  [KING]: KING_SVG,
};

const NAMES: Record<PieceType, string> = {
  [PAWN]: "pawn",
  [KNIGHT]: "knight",
  [BISHOP]: "bishop",
  [ROOK]: "rook",
  [QUEEN]: "queen",
  [KING]: "king",
};

/** Full inline SVG element string for a piece, themed by the `.piece-*` class. */
export function pieceSvg(type: PieceType, color: Color): string {
  const cls = color === WHITE ? "piece-white" : "piece-black";
  const label = `${color === WHITE ? "White" : "Black"} ${NAMES[type]}`;
  return `<svg class="piece ${cls}" viewBox="0 0 45 45" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">${SHAPES[type]}</svg>`;
}

export function pieceName(type: PieceType): string {
  return NAMES[type];
}
