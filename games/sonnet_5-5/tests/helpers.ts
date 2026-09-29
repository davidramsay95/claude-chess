import { Game } from '../src/engine/game';
import type { Move } from '../src/engine/types';

/** Deterministic PRNG so failures in random playouts can be reproduced. */
export const seededRng = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const playUci = (game: Game, moves: readonly string[]): void => {
  for (const uci of moves) {
    const move = game.parseUci(uci);
    if (move === undefined) throw new Error(`Illegal move in test: ${uci}`);
    game.play(move);
  }
};

export const randomLegalMove = (game: Game, rng: () => number): Move | undefined => {
  const legal = game.legalMoves();
  return legal.length ? legal[Math.floor(rng() * legal.length)] : undefined;
};

/** Flips ranks and swaps colors, so a symmetric evaluation must give the same score. */
export const mirrorFen = (fen: string): string => {
  const [placement, side, castling, ep, half, full] = fen.split(' ');
  const swapCase = (text: string): string =>
    [...text].map((ch) => (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase())).join('');
  const rows = placement.split('/').reverse().map(swapCase).join('/');
  const mirroredEp = ep === '-' ? '-' : `${ep[0]}${9 - Number(ep[1])}`;
  const mirroredCastling = castling === '-' ? '-' : swapCase(castling).split('').sort().join('');
  return `${rows} ${side === 'w' ? 'b' : 'w'} ${mirroredCastling} ${mirroredEp} ${half} ${full}`;
};
