export type PieceKind = "p" | "n" | "b" | "r" | "q" | "k";
export type PieceColor = "w" | "b";

/*
 * Original artwork. Every piece is drawn in a 0 0 64 64 viewBox, centred on
 * x=32, standing on a shared flared base whose bottom edge sits at y=58.
 * Nothing here carries a literal colour decision: the three CSS custom
 * properties below are the only paint, so one geometry serves both sides.
 */

/** Shared group attributes: one stroke weight keeps the six pieces a family. */
const GROUP = `<g stroke-linejoin="round" stroke-linecap="round" stroke-width="1.8">`;

/** Main body paint. */
const BODY = `fill="var(--pc-fill, #f2efe6)" stroke="var(--pc-stroke, #23252b)"`;

/** Secondary detail paint: crown orbs, crenel shadows, the knight's eye. */
const DETAIL = `fill="var(--pc-accent, #b08d57)" stroke="var(--pc-stroke, #23252b)" stroke-width="1.2"`;

/** Accent line work: the bishop's mitre slit, the knight's mane. */
const MARK = `fill="none" stroke="var(--pc-accent, #b08d57)" stroke-width="2.2"`;

/** Outline-only line work drawn in the stroke colour. */
const INK = `fill="none" stroke="var(--pc-stroke, #23252b)" stroke-width="1.3"`;

/** Flared foot plus its plinth: identical on all six pieces. */
const SOCLE =
  `<path d="M 13.5 58 L 50.5 58 C 50.5 53.6 46.2 52.4 44.2 50.2 L 19.8 50.2 C 17.8 52.4 13.5 53.6 13.5 58 Z" ${BODY}/>` +
  `<rect x="17" y="47.6" width="30" height="3.2" rx="1.6" ${BODY}/>`;

const GEOMETRY: Record<PieceKind, string> = {
  // Narrow collar, small sphere head. Deliberately the shortest silhouette.
  p: `${GROUP}${SOCLE}
<path d="M 24.5 47.6 C 26.2 44.2 27.6 41.4 27.6 38.6 L 36.4 38.6 C 36.4 41.4 37.8 44.2 39.5 47.6 Z" ${BODY}/>
<rect x="25.6" y="35.6" width="12.8" height="3.2" rx="1.6" ${BODY}/>
<circle cx="32" cy="28.6" r="7.2" ${BODY}/></g>`,

  // Horse head in profile facing left: one closed outline, then eye and mane.
  n: `${GROUP}${SOCLE}
<path d="M 20.5 47.6 C 19.3 42.2 19 37.4 19.6 33.6 C 20 31 18.6 29.8 15.8 29
C 12.6 28.1 10.2 26.8 10 24.6 C 9.9 23.2 11 22.3 12.6 22
C 15 21.6 16.4 21 17.8 19.8 C 20.6 17.4 23.4 15 26.6 13.2
C 27.5 12.7 28.4 12.3 29.2 12 L 31 9.5 L 33.6 13.8
C 36.4 14.6 39.2 16.6 41.4 19.8 C 44 23.6 45.2 28.6 45 34
C 44.8 39.4 44.2 44 43.5 47.6 Z" ${BODY}/>
<path d="M 34.4 15.6 C 37.2 18.4 39.4 22.4 40.4 27 C 41.2 31 41.4 35.4 41 39.8
C 39.6 35 38.4 30.2 36.6 25.8 C 35.4 22.8 34.4 19.6 34.4 15.6 Z" ${DETAIL}/>
<path d="M 36.6 17.6 C 39 21.4 40.4 25.6 40.8 30.2" ${MARK}/>
<path d="M 12 24.2 C 14 24.8 16 25 17.4 24.6" ${INK}/>
<circle cx="21" cy="21.8" r="1.7" ${DETAIL}/></g>`,

  // Teardrop mitre with the traditional diagonal slit and a finial ball.
  b: `${GROUP}${SOCLE}
<path d="M 21.5 47.6 C 23.2 44.4 24.2 41.4 24.2 38.4 L 39.8 38.4 C 39.8 41.4 40.8 44.4 42.5 47.6 Z" ${BODY}/>
<rect x="21.6" y="35.2" width="20.8" height="3.4" rx="1.7" ${BODY}/>
<path d="M 24.2 35.4 C 22.5 30.2 23.8 24.6 27.8 20.4 C 29.4 18.7 31 17.2 32 15.4
C 33 17.2 34.6 18.7 36.2 20.4 C 40.2 24.6 41.5 30.2 39.8 35.4 Z" ${BODY}/>
<circle cx="32" cy="13.2" r="2.4" ${BODY}/>
<path d="M 26.8 29.8 L 34.6 20.6" ${MARK}/></g>`,

  // Tapered tower under a flat top of three merlons and two gaps.
  r: `${GROUP}${SOCLE}
<path d="M 21 47.6 C 22.6 44.2 23.6 40.8 23.6 37.4 L 40.4 37.4 C 40.4 40.8 41.4 44.2 43 47.6 Z" ${BODY}/>
<path d="M 23.6 37.4 C 23.4 32.4 22.4 27.2 21.8 23.4 L 42.2 23.4 C 41.6 27.2 40.6 32.4 40.4 37.4 Z" ${BODY}/>
<rect x="19.4" y="20.2" width="25.2" height="3.6" rx="1.4" ${BODY}/>
<path d="M 19.4 20.6 L 19.4 13 L 24.6 13 L 24.6 16.6 L 29.4 16.6 L 29.4 13
L 34.6 13 L 34.6 16.6 L 39.4 16.6 L 39.4 13 L 44.6 13 L 44.6 20.6 Z" ${BODY}/>
<rect x="24.6" y="13" width="4.8" height="3.6" ${DETAIL}/>
<rect x="34.6" y="13" width="4.8" height="3.6" ${DETAIL}/></g>`,

  // Five-point crown, an orb on each point, beaded band below.
  q: `${GROUP}${SOCLE}
<path d="M 20.5 47.6 C 22 44.4 23 41 23 37.6 L 41 37.6 C 41 41 42 44.4 43.5 47.6 Z" ${BODY}/>
<rect x="20" y="34.4" width="24" height="3.2" rx="1.6" ${BODY}/>
<path d="M 23 34.4 C 21.6 30 20.6 25.6 20.4 21.4 L 43.6 21.4 C 43.4 25.6 42.4 30 41 34.4 Z" ${BODY}/>
<path d="M 20.4 21.4 L 21.4 15.2 L 24.1 19.6 L 26.7 13.2 L 29.4 19.6 L 32 11.8
L 34.6 19.6 L 37.3 13.2 L 39.9 19.6 L 42.6 15.2 L 43.6 21.4 Z" ${BODY}/>
<circle cx="21.4" cy="13.6" r="2" ${DETAIL}/>
<circle cx="26.7" cy="11.6" r="2" ${DETAIL}/>
<circle cx="32" cy="10.2" r="2" ${DETAIL}/>
<circle cx="37.3" cy="11.6" r="2" ${DETAIL}/>
<circle cx="42.6" cy="13.6" r="2" ${DETAIL}/>
<circle cx="24" cy="36" r="1.15" ${DETAIL}/>
<circle cx="28" cy="36" r="1.15" ${DETAIL}/>
<circle cx="32" cy="36" r="1.15" ${DETAIL}/>
<circle cx="36" cy="36" r="1.15" ${DETAIL}/>
<circle cx="40" cy="36" r="1.15" ${DETAIL}/></g>`,

  // Rounded crown with a banded waist, crowned by two crossed bars.
  k: `${GROUP}${SOCLE}
<path d="M 20.5 47.6 C 22 44.4 23 41 23 37.6 L 41 37.6 C 41 41 42 44.4 43.5 47.6 Z" ${BODY}/>
<rect x="20" y="34.4" width="24" height="3.2" rx="1.6" ${BODY}/>
<path d="M 23 34.4 C 21.4 30 20.8 25.6 22 22 C 23.4 17.8 27.4 15.4 32 15.4
C 36.6 15.4 40.6 17.8 42 22 C 43.2 25.6 42.6 30 41 34.4 Z" ${BODY}/>
<rect x="22" y="22.2" width="20" height="3" rx="1.5" ${DETAIL}/>
<rect x="30" y="5" width="4" height="12.8" rx="1.3" ${BODY}/>
<rect x="24.8" y="8.4" width="14.4" height="4" rx="1.3" ${BODY}/></g>`,
};

/** Inner SVG markup (no <svg> wrapper) for one piece, drawn in a 0 0 64 64 viewBox. */
export function pieceGeometry(kind: PieceKind): string {
  return GEOMETRY[kind];
}

/** A complete standalone <svg> element string for one piece, ready to inject with innerHTML. */
export function pieceSvg(kind: PieceKind, color: PieceColor): string {
  return (
    `<svg viewBox="0 0 64 64" class="piece ${sideClass(color)} ${kindClass(kind)}" ` +
    `xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">` +
    pieceGeometry(kind) +
    `</svg>`
  );
}

/**
 * Colour and kind live in separate class namespaces on purpose. Naming both
 * `piece-<letter>` would make the black side and the bishop collide on
 * `piece-b`, and the colour rule would repaint every white bishop.
 */
export function sideClass(color: PieceColor): string {
  return color === "w" ? "side-white" : "side-black";
}

export function kindClass(kind: PieceKind): string {
  return `kind-${kind}`;
}
