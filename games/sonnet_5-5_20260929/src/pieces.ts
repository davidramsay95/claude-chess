import { BISHOP, KING, KNIGHT, PAWN, QUEEN, ROOK, pieceColor, pieceType } from "./engine/position";

export const PIECE_NAMES: Record<number, string> = {
  [PAWN]: "pawn",
  [KNIGHT]: "knight",
  [BISHOP]: "bishop",
  [ROOK]: "rook",
  [QUEEN]: "queen",
  [KING]: "king",
};

/**
 * Each piece has a `body` (filled and outlined, coloured by CSS per side) and
 * `detail` strokes drawn on top. Everything sits in a 45 by 45 box, centred on x = 22.5.
 */
interface PieceArt {
  body: string[];
  detail: string[];
  /** Small filled dots such as the queen's pearls, given as "cx cy r". */
  dots?: string[];
}

const BASE = "M10.5 39.5V35.5H34.5V39.5Z";

const ART: Record<number, PieceArt> = {
  [PAWN]: {
    body: [
      "M22.5 8.5A5.2 5.2 0 0 1 24.6 18.4C22.5 19.6 20.6 19.4 20.4 18.4A5.2 5.2 0 0 1 22.5 8.5Z",
      "M22.5 18C19.4 18 17.3 20.4 17.3 23.2C17.3 25 18.2 26.4 19.6 27.4C15.6 29.6 12.6 33 12.5 39.5H32.5C32.4 33 29.4 29.6 25.4 27.4C26.8 26.4 27.7 25 27.7 23.2C27.7 20.4 25.6 18 22.5 18Z",
    ],
    detail: ["M17.6 27.2H27.4", "M14 35.6H31"],
  },
  [ROOK]: {
    body: [
      BASE,
      "M14.5 35.5L15.6 21H29.4L30.5 35.5Z",
      "M11.5 21V9.5H16.5V13.2H20V9.5H25V13.2H28.5V9.5H33.5V21Z",
    ],
    detail: ["M11.5 21H33.5", "M15.6 21.1H29.4", "M14.6 35.5H30.4"],
  },
  [BISHOP]: {
    body: [
      "M22.5 4.2A2.6 2.6 0 1 1 22.5 9.4A2.6 2.6 0 1 1 22.5 4.2Z",
      "M22.5 9.6C29 14.6 30.4 20.4 27.6 25.2C27 26.2 26 26.9 25.2 27.4H19.8C19 26.9 18 26.2 17.4 25.2C14.6 20.4 16 14.6 22.5 9.6Z",
      "M14.4 27.4H30.6V31.2H14.4Z",
      "M18.2 31.2C18.6 34 16.4 35.4 13 37.2V39.5H32V37.2C28.6 35.4 26.4 34 26.8 31.2Z",
    ],
    detail: ["M19.6 15.6L25.4 21.4", "M22.4 12.8L27.2 17.6"],
  },
  [KNIGHT]: {
    body: [
      "M11.5 39.5C11.2 32.6 13.6 28.6 17.6 25C19.6 23.2 20 21.8 19.6 20.4C17.6 21.6 15.6 23.6 13.4 24.6C11.8 25.3 10.4 24.8 9.8 23.4C9.4 22.3 9.9 21.2 11.2 19.6C12.8 17.6 13.6 16 14.2 14.4C14.5 13.2 14.4 11.8 14.2 10.2C16.2 10.4 17.8 11.4 19 12.6C20 10.6 21.6 8.8 23.4 8C24.2 9.4 24.4 10.6 24.4 11.8C30.6 13.2 35.4 19.6 35.4 28.6C35.4 32.6 34.8 36 34.5 39.5Z",
    ],
    detail: [
      "M24.8 13.6C28.6 16.4 30.6 21.6 30.6 28.4",
      "M13.6 24.2C15.4 23.8 16.8 22.6 18 21.4",
      "M13.8 39.5H34",
    ],
    dots: ["17.2 16.2 1.15", "11.9 22.4 0.9"],
  },
  [QUEEN]: {
    body: [
      BASE,
      "M11 35.5L7.4 16L13.6 27.4L14.4 11.4L19.6 25.4L22.5 8.4L25.4 25.4L30.6 11.4L31.4 27.4L37.6 16L34 35.5Z",
    ],
    detail: ["M11.6 31.6C17 33.4 28 33.4 33.4 31.6", "M14.5 35.5H30.5"],
    dots: ["7.4 13.6 2.2", "14.4 9 2.2", "22.5 5.8 2.4", "30.6 9 2.2", "37.6 13.6 2.2"],
  },
  [KING]: {
    body: [
      "M21 2.8H24V5.6H27.2V8.6H24V12.6H21V8.6H17.8V5.6H21Z",
      BASE,
      "M22.5 12.6C17 11.6 8 13.8 8.4 21.8C8.8 27 14.6 28.6 18.2 30.6L16.8 35.5H28.2L26.8 30.6C30.4 28.6 36.2 27 36.6 21.8C37 13.8 28 11.6 22.5 12.6Z",
    ],
    detail: ["M22.5 12.8V31", "M17.2 30.8H27.8", "M14.6 35.5H30.4"],
  },
};

const renderPaths = (paths: string[], className: string): string =>
  paths.map((path) => `<path class="${className}" d="${path}"/>`).join("");

const renderDots = (dots: string[]): string =>
  dots
    .map((dot) => {
      const [cx, cy, r] = dot.split(" ");
      return `<circle class="dot" cx="${cx}" cy="${cy}" r="${r}"/>`;
    })
    .join("");

/** Returns inline SVG markup for a piece code (type | colour << 3). Colours come from CSS. */
export const pieceSvg = (piece: number): string => {
  const art = ART[pieceType(piece)];
  if (art === undefined) throw new Error(`No artwork for piece code ${piece}`);
  const side = pieceColor(piece) === 0 ? "w" : "b";
  return (
    `<svg class="piece-svg piece-${side}" viewBox="0 0 45 45" aria-hidden="true" focusable="false">` +
    renderPaths(art.body, "body") +
    renderDots(art.dots ?? []) +
    renderPaths(art.detail, "detail") +
    `</svg>`
  );
};

export const pieceLabel = (piece: number): string =>
  `${pieceColor(piece) === 0 ? "white" : "black"} ${PIECE_NAMES[pieceType(piece)]}`;
