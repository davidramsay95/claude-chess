export type PieceChar = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P' | 'k' | 'q' | 'r' | 'b' | 'n' | 'p';

type PieceColor = 'white' | 'black';

interface PieceStyle {
  fill: string;
  stroke: string;
  strokeWidth: string;
}

function getStyle(color: PieceColor): PieceStyle {
  return color === 'white'
    ? { fill: '#fff', stroke: '#333', strokeWidth: '1.5' }
    : { fill: '#333', stroke: '#666', strokeWidth: '1.5' };
}

function wrap(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%">${inner}</svg>`;
}

function kingPath(style: PieceStyle): string {
  const { fill, stroke, strokeWidth } = style;
  const s = `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`;
  return wrap(`
    <g ${s}>
      <line x1="22.5" y1="2" x2="22.5" y2="8" />
      <line x1="19.5" y1="5" x2="25.5" y2="5" />
      <path d="M 11.5 37 C 17 40.5 27 40.5 32.5 37 L 34 30 C 34 25 28 25.5 22.5 25 C 17 25.5 11 25 11 30 L 11.5 37 z" />
      <path d="M 11.5 30 C 17 27 27 27 32.5 30" fill="none" />
      <path d="M 11.5 33.5 C 17 30.5 27 30.5 32.5 33.5" fill="none" />
      <path d="M 11.5 37 C 17 34 27 34 32.5 37" fill="none" />
      <path d="M 20 8 L 22.5 14 L 25 8" fill="none" />
      <path d="M 14 16 L 11 14 L 10 18 L 13 20 C 14 21 17 23 22.5 23 C 28 23 31 21 32 20 L 35 18 L 34 14 L 31 16 C 28.5 14.5 25.5 13 22.5 14 C 19.5 13 16.5 14.5 14 16 z" />
    </g>
  `);
}

function queenPath(style: PieceStyle): string {
  const { fill, stroke, strokeWidth } = style;
  const s = `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`;
  return wrap(`
    <g ${s}>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="14" cy="7" r="2.5" />
      <circle cx="22.5" cy="5" r="2.5" />
      <circle cx="31" cy="7" r="2.5" />
      <circle cx="39" cy="12" r="2.5" />
      <path d="M 9 26 C 17.5 24.5 27.5 24.5 36 26 L 38 14 L 31 25 L 22.5 10 L 14 25 L 7 14 L 9 26 z" />
      <path d="M 9 26 C 9 28 10 30.5 22.5 30.5 C 35 30.5 36 28 36 26 C 27.5 24.5 17.5 24.5 9 26 z" />
      <path d="M 11.5 30.5 C 15 29 30 29 33.5 30.5" fill="none" />
      <path d="M 12 33.5 C 17.5 35 27.5 35 33 33.5" fill="none" />
      <path d="M 11.5 37 C 17 40.5 27 40.5 32.5 37 L 34 30 C 34 25 28 30.5 22.5 30.5 C 17 30.5 11 25 11 30 L 11.5 37 z" fill="none" />
      <path d="M 11.5 37 C 17 40.5 27 40.5 32.5 37 L 34 30.5 C 34 28.5 28 31 22.5 31 C 17 31 11 28.5 11 30.5 L 11.5 37 z" />
      <path d="M 11.5 37 C 17 34 27 34 32.5 37" fill="none" />
    </g>
  `);
}

function rookPath(style: PieceStyle): string {
  const { fill, stroke, strokeWidth } = style;
  const s = `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`;
  return wrap(`
    <g ${s}>
      <path d="M 9 39 L 36 39 L 36 36 L 9 36 L 9 39 z" />
      <path d="M 12 36 L 12 32 L 33 32 L 33 36 L 12 36 z" />
      <path d="M 11 14 L 11 10 L 15 10 L 15 13 L 20 13 L 20 10 L 25 10 L 25 13 L 30 13 L 30 10 L 34 10 L 34 14" />
      <path d="M 34 14 L 31 17 L 14 17 L 11 14 z" />
      <path d="M 31 17 L 31 32 L 14 32 L 14 17" fill="none" />
      <path d="M 14 17 L 14 32 L 31 32 L 31 17 z" />
      <path d="M 14 20.5 L 31 20.5" fill="none" />
      <path d="M 14 24 L 31 24" fill="none" />
    </g>
  `);
}

function bishopPath(style: PieceStyle): string {
  const { fill, stroke, strokeWidth } = style;
  const s = `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`;
  return wrap(`
    <g ${s}>
      <path d="M 9 36 C 12.4 35.7 19 36.4 22.5 34 C 26 36.4 32.6 35.7 36 36 C 36 36 37.6 36.8 39 38 C 38.3 39 37 39 36 39.2 L 9 39.2 C 8 39 6.7 39 6 38 C 7.4 36.8 9 36 9 36 z" />
      <path d="M 15 32 C 17.5 34.5 27.5 34.5 30 32 C 30.5 30.5 30 30 30 30 C 30 27.5 27.5 26 27.5 26 C 33 24.5 33.5 14.5 22.5 10.5 C 11.5 14.5 12 24.5 17.5 26 C 17.5 26 15 27.5 15 30 C 15 30 14.5 30.5 15 32 z" />
      <path d="M 25 8 A 2.5 2.5 0 1 1 20 8 A 2.5 2.5 0 1 1 25 8 z" />
      <path d="M 17.5 26 L 27.5 26" fill="none" />
      <line x1="15" y1="30" x2="30" y2="30" fill="none" />
      <path d="M 22.5 15.5 L 22.5 21" fill="none" />
      <path d="M 20 18 L 25 18" fill="none" />
    </g>
  `);
}

function knightPath(style: PieceStyle): string {
  const { fill, stroke, strokeWidth } = style;
  const s = `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`;
  const eyeFill = style.fill === '#fff' ? '#333' : '#fff';
  return wrap(`
    <g ${s}>
      <path d="M 10 39.5 L 35 39.5 L 35 36 C 35 30 29 28.5 29 25.5 C 29 22 34 18 34 12 C 34 5.5 28 1 22 6 C 17 3 11.5 7 13 13 C 8 14 6.5 18 7 22 C 7.5 26 10 30 10 36 L 10 39.5 z" />
      <path d="M 18 10.5 C 19.5 9 21 8 24 9 C 25.5 10.5 23.5 14.5 23.5 16 C 23.5 18.5 27 21 29 25.5 C 29 28.5 35 30 35 36 L 10 36 C 10 30 7.5 26 7 22 C 6.5 18 8 14 13 13 L 16 11.5" fill="none" />
      <circle cx="17" cy="13" r="1.5" fill="${eyeFill}" stroke="${eyeFill}" stroke-width="0.5" />
      <path d="M 13.5 17.5 C 13 18.5 11 21 9.5 22.5" fill="none" stroke="${stroke}" stroke-width="1" />
      <path d="M 15 16 C 14 17 11.5 19.5 10 20.5" fill="none" stroke="${stroke}" stroke-width="1" />
      <path d="M 22 8 C 22.5 9.5 21 12 19.5 14" fill="none" />
    </g>
  `);
}

function pawnPath(style: PieceStyle): string {
  const { fill, stroke, strokeWidth } = style;
  const s = `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`;
  return wrap(`
    <g ${s}>
      <path d="M 22.5 9 C 20 9 18 10.5 18 12.5 C 18 14 19.5 15 19.5 15 C 17.5 16 14.5 19 14.5 23 L 30.5 23 C 30.5 19 27.5 16 25.5 15 C 25.5 15 27 14 27 12.5 C 27 10.5 25 9 22.5 9 z" />
      <path d="M 14.5 23 C 14 26 12 29 9.5 32 L 35.5 32 C 33 29 31 26 30.5 23" fill="none" />
      <path d="M 9.5 32 L 35.5 32 L 36 36 L 9 36 L 9.5 32 z" />
      <path d="M 9 36 L 36 36 L 36.5 39 L 8.5 39 L 9 36 z" />
    </g>
  `);
}

const pieceFunctions: Record<string, (style: PieceStyle) => string> = {
  k: kingPath,
  q: queenPath,
  r: rookPath,
  b: bishopPath,
  n: knightPath,
  p: pawnPath,
};

export function getPieceSvg(piece: PieceChar): string {
  const isWhite = piece === piece.toUpperCase();
  const color: PieceColor = isWhite ? 'white' : 'black';
  const style = getStyle(color);
  const key = piece.toLowerCase();
  const fn = pieceFunctions[key];
  if (!fn) {
    return '';
  }
  return fn(style);
}
