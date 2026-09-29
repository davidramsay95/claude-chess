/** Deterministic 32-bit PRNG (mulberry32) so hashes are stable across runs. */
const createRng = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) | 0;
  };
};

const rng = createRng(0xc0ffee);
const table = (size: number): Int32Array => Int32Array.from({ length: size }, () => rng());

/** Indexed by `piece * 64 + square`, piece up to 14. */
export const PIECE_KEYS_LO = table(15 * 64);
export const PIECE_KEYS_HI = table(15 * 64);
export const CASTLE_KEYS_LO = table(16);
export const CASTLE_KEYS_HI = table(16);
export const EP_KEYS_LO = table(8);
export const EP_KEYS_HI = table(8);
export const SIDE_KEY_LO = rng();
export const SIDE_KEY_HI = rng();
