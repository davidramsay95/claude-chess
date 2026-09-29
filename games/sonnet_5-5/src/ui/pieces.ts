import { BLACK, BISHOP, type Color, KING, KNIGHT, PAWN, QUEEN, ROOK, WHITE } from '../engine/types';

/**
 * Original piece artwork on a 100x100 grid. Every shape is built from `body`
 * (filled, outlined), `line` (detail strokes) and `dot` (detail fills); colors
 * come from CSS custom properties so one drawing serves both sides.
 */
const body = (d: string): string => `<path class="pb" d="${d}"/>`;
const line = (d: string): string => `<path class="pl" d="${d}"/>`;
const dot = (cx: number, cy: number, r: number): string => `<circle class="pd" cx="${cx}" cy="${cy}" r="${r}"/>`;
const ball = (cx: number, cy: number, r: number): string => `<circle class="pb" cx="${cx}" cy="${cy}" r="${r}"/>`;

/** Shared plinth so the pieces read as one set. */
const PLINTH = body('M22 91 V86 Q22 82 27 82 H73 Q78 82 78 86 V91 Z');

const SHAPES: Record<number, string> = {
  [PAWN]: [
    body('M50 40 C40 41 36 47 38 51 H62 C64 47 60 41 50 40 Z'),
    body('M41 50 C41 64 34 72 30 82 H70 C66 72 59 64 59 50 Z'),
    ball(50, 29, 11),
    body('M35 51 H65 Q67 51 67 53 V56 Q67 58 65 58 H35 Q33 58 33 56 V53 Q33 51 35 51 Z'),
    PLINTH,
  ].join(''),

  [ROOK]: [
    body('M27 18 H39 V26 H45 V18 H55 V26 H61 V18 H73 V38 L67 44 V70 L73 77 V82 H27 V77 L33 70 V44 L27 38 Z'),
    line('M27 38 H73'),
    line('M33 70 H67'),
    line('M42 50 V62 M50 50 V62 M58 50 V62'),
    PLINTH,
  ].join(''),

  [KNIGHT]: [
    body(
      'M27 82 C26 70 30 62 38 55 C33 55 29 58 25 61 C19 61 17 55 20 50 L32 33 C33 25 37 18 41 13 L46 19 C50 15 55 14 60 15 C74 20 79 40 76 58 C75 68 73 75 74 82 Z',
    ),
    line('M40 33 L46 38'),
    line('M52 22 C60 24 66 34 66 46'),
    line('M57 30 C62 34 64 42 64 52'),
    dot(40, 31, 2.6),
    dot(23, 54, 1.8),
    PLINTH,
  ].join(''),

  [BISHOP]: [
    ball(50, 12, 5),
    body('M50 17 C64 25 69 39 62 49 C60 52 57 53 56 55 H44 C43 53 40 52 38 49 C31 39 36 25 50 17 Z'),
    line('M44 40 L57 27'),
    body('M35 55 H65 Q67 55 67 57 V61 Q67 63 65 63 H35 Q33 63 33 61 V57 Q33 55 35 55 Z'),
    body('M42 63 C42 71 36 76 32 82 H68 C64 76 58 71 58 63 Z'),
    PLINTH,
  ].join(''),

  [QUEEN]: [
    body('M27 79 L17 38 L32 54 L34 27 L43 53 L50 22 L57 53 L66 27 L68 54 L83 38 L73 79 Z'),
    ball(17, 33, 5),
    ball(34, 22, 5),
    ball(50, 17, 5.5),
    ball(66, 22, 5),
    ball(83, 33, 5),
    line('M29 70 H71'),
    PLINTH,
  ].join(''),

  [KING]: [
    body('M46 6 H54 V13 H61 V21 H54 V28 H46 V21 H39 V13 H46 Z'),
    body('M50 28 C67 28 79 39 75 54 C73 61 66 65 66 71 L71 82 H29 L34 71 C34 65 27 61 25 54 C21 39 33 28 50 28 Z'),
    line('M32 68 H68'),
    line('M27 52 C36 56 64 56 73 52'),
    PLINTH,
  ].join(''),
};

/** Returns an inline SVG string for a piece. Decorative: the parent element carries the accessible name. */
export const pieceSvg = (kind: number, color: Color): string =>
  `<svg class="piece-svg ${color === WHITE ? 'piece-white' : 'piece-black'}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${SHAPES[kind] ?? ''}</svg>`;

const KIND_NAMES: Record<number, string> = {
  [PAWN]: 'pawn',
  [KNIGHT]: 'knight',
  [BISHOP]: 'bishop',
  [ROOK]: 'rook',
  [QUEEN]: 'queen',
  [KING]: 'king',
};

export const kindName = (kind: number): string => KIND_NAMES[kind] ?? 'piece';

export const colorName = (color: Color): string => (color === BLACK ? 'black' : 'white');
