export type PieceKind = "p" | "n" | "b" | "r" | "q" | "k";
export type PieceColor = "w" | "b";

/** Geometry of one piece: filled body parts drawn back to front, then contrasting detail work on top. */
interface PieceArt {
  /** Path data for body parts, each filled with the gradient and outlined. */
  shapes: string[];
  /** Path data for engraved lines drawn with the detail colour and no fill. */
  lines: string[];
  /** Path data for small solid marks (eyes, nostrils) filled with the detail colour. */
  marks: string[];
}

/** Colour scheme for one side. */
interface Palette {
  gradientStops: readonly (readonly [offset: number, color: string])[];
  outline: string;
  detail: string;
  detailWidth: number;
}

const PALETTES: Record<PieceColor, Palette> = {
  w: {
    gradientStops: [
      [0, "#fffcf4"],
      [0.5, "#f4e9d3"],
      [1, "#dcc7a1"],
    ],
    outline: "#2a2320",
    detail: "#2a2320",
    detailWidth: 2,
  },
  b: {
    gradientStops: [
      [0, "#6b625b"],
      [0.5, "#3d3733"],
      [1, "#23201e"],
    ],
    outline: "#110d0b",
    detail: "#d8c7a8",
    detailWidth: 1.6,
  },
};

const OUTLINE_WIDTH = 3;
const CENTER = 50;
const BASELINE = 88;

const circle = (cx: number, cy: number, r: number): string =>
  `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;

const roundedRect = (x: number, y: number, width: number, height: number, r: number): string =>
  `M${x + r} ${y}H${x + width - r}Q${x + width} ${y} ${x + width} ${y + r}V${y + height - r}` +
  `Q${x + width} ${y + height} ${x + width - r} ${y + height}H${x + r}Q${x} ${y + height} ${x} ${y + height - r}` +
  `V${y + r}Q${x} ${y} ${x + r} ${y}Z`;

/** Horizontal band centred on the piece axis. */
const band = (halfWidth: number, top: number, bottom: number): string =>
  roundedRect(CENTER - halfWidth, top, halfWidth * 2, bottom - top, Math.min(2.5, (bottom - top) / 2));

/** Sloped plinth that every piece stands on, resting on the shared baseline. */
const plinth = (halfWidth: number, top: number): string => {
  const left = CENTER - halfWidth;
  const right = CENTER + halfWidth;
  return (
    `M${left + 2} ${BASELINE}H${right - 2}Q${right} ${BASELINE} ${right - 0.6} ${BASELINE - 2.2}` +
    `L${right - 3} ${top + 2}Q${right - 3.8} ${top} ${right - 6} ${top}H${left + 6}` +
    `Q${left + 3.8} ${top} ${left + 3} ${top + 2}L${left + 0.6} ${BASELINE - 2.2}Q${left} ${BASELINE} ${left + 2} ${BASELINE}Z`
  );
};

/** Engraved groove running across the plinth. */
const plinthGroove = (halfWidth: number, y: number): string => `M${CENTER - halfWidth} ${y}H${CENTER + halfWidth}`;

const pawn = (): PieceArt => ({
  shapes: [
    "M41.5 46C42 58 37.5 69 31 80H69C62.5 69 58 58 58.5 46Z",
    band(12.5, 41.5, 48),
    circle(CENTER, 29.5, 12),
    plinth(25, 79),
  ],
  lines: [plinthGroove(19, 83.5)],
  marks: [],
});

const knight = (): PieceArt => ({
  shapes: [
    "M73 80C77.5 66 80.5 50 77.5 37.5C75 27 69 19.5 63 16.5L60.5 8C57 10 54.5 13.5 54 17.5" +
      "C45 18.5 37 23.5 30.5 31.5C25.5 37.5 19.5 44 15.5 49.5C12.8 53.5 13.5 59 17.5 61.5C21 63.5 25 63 28.5 61.5" +
      "C32 60 35 60.2 38.5 59.2C41.8 58.2 44.2 56 46 53.5C46.5 61 42 66.5 35 72.5C32.5 74.8 30.5 77.5 30.5 80Z",
    plinth(28, 79),
  ],
  lines: [
    plinthGroove(22, 83.5),
    "M65.5 21.5C72 30 74 44 72 58C71 66 69.5 72 68 77",
    "M17.5 58C21.5 56.8 25.5 56.8 29.5 58",
    "M46 53.5C47.8 49 48.2 44.5 47 40",
  ],
  marks: [
    "M38 32.5C40.2 29.8 44.6 28.8 47.4 30C45.8 32.8 41.8 34.3 38 32.5Z",
    circle(20.5, 52, 1.7),
  ],
});

const bishop = (): PieceArt => ({
  shapes: [
    "M44 55C44.5 64 41 72 36 80H64C59 72 55.5 64 56 55Z",
    band(13, 49.5, 56),
    "M50 17C40 25 34.5 34 35.5 42C36.3 47.5 42 50.5 50 50.5C58 50.5 63.7 47.5 64.5 42C65.5 34 60 25 50 17Z",
    circle(CENTER, 13, 4.5),
    plinth(27, 79),
  ],
  lines: [plinthGroove(21, 83.5), "M57.5 27L47 39"],
  marks: [],
});

const rook = (): PieceArt => ({
  shapes: [
    "M35 71L37 36H63L65 71Z",
    band(20, 70, 79),
    band(20, 30, 37),
    "M30 31V15H40V21H45V15H55V21H60V15H70V31Z",
    plinth(29, 79),
  ],
  lines: [plinthGroove(23, 83.5), "M34 26H66"],
  marks: [],
});

const queen = (): PieceArt => ({
  shapes: [
    "M42 43C43 53 41 63 36.5 73H63.5C59 63 57 53 58 43Z",
    band(19, 72, 79.5),
    "M36 40L28.5 20.5L38 29L40 14.5L46 27.5L50 11.5L54 27.5L60 14.5L62 29L71.5 20.5L64 40Z",
    band(15, 37.5, 44),
    circle(28.5, 18.5, 3.4),
    circle(40, 12.5, 3.4),
    circle(CENTER, 9.5, 3.4),
    circle(60, 12.5, 3.4),
    circle(71.5, 18.5, 3.4),
    plinth(30, 79),
  ],
  lines: [plinthGroove(24, 83.5), "M37 34.5C45 32.5 55 32.5 63 34.5"],
  marks: [],
});

const king = (): PieceArt => ({
  shapes: [
    "M42 46C43 55 41 64 36.5 73H63.5C59 64 57 55 58 46Z",
    band(19, 72, 79.5),
    "M47.2 25V18.5H41.5V12.5H47.2V5.5H52.8V12.5H58.5V18.5H52.8V25Z",
    "M37 41L32.5 28C40 24 60 24 67.5 28L63 41Z",
    band(15, 39.5, 46.5),
    plinth(30, 79),
  ],
  lines: [plinthGroove(24, 83.5), "M36.5 34.5C45 32.5 55 32.5 63.5 34.5"],
  marks: [],
});

const ART: Record<PieceKind, () => PieceArt> = { p: pawn, n: knight, b: bishop, r: rook, q: queen, k: king };

const gradientId = (kind: PieceKind, color: PieceColor): string => `opus55-grad-${color}${kind}`;

const gradientDefinition = (id: string, palette: Palette): string => {
  const stops = palette.gradientStops
    .map(([offset, stopColor]) => `<stop offset="${offset}" stop-color="${stopColor}"/>`)
    .join("");
  // User space coordinates keep the shading continuous across the separate body parts.
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="8" x2="0" y2="${BASELINE}">${stops}</linearGradient>`;
};

/**
 * Builds the artwork for one chess piece.
 * @param kind Piece type: pawn, knight, bishop, rook, queen or king.
 * @param color Side: white ("w") or black ("b").
 * @returns A complete standalone `<svg>` string with viewBox "0 0 100 100" and no width or height, so CSS sizes it.
 */
export function pieceSvg(kind: PieceKind, color: PieceColor): string {
  const art = ART[kind]();
  const palette = PALETTES[color];
  const id = gradientId(kind, color);
  const shapes = art.shapes.map((d) => `<path d="${d}"/>`).join("");
  const lines = art.lines.map((d) => `<path d="${d}"/>`).join("");
  const marks = art.marks.map((d) => `<path d="${d}"/>`).join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<defs>${gradientDefinition(id, palette)}</defs>` +
    `<g fill="url(#${id})" stroke="${palette.outline}" stroke-width="${OUTLINE_WIDTH}" stroke-linejoin="round">${shapes}</g>` +
    `<g fill="none" stroke="${palette.detail}" stroke-width="${palette.detailWidth}" stroke-linecap="round">${lines}</g>` +
    `<g fill="${palette.detail}">${marks}</g>` +
    `</svg>`
  );
}
