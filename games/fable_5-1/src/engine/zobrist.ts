/**
 * Zobrist hashing with two independent 32-bit keys. JavaScript has no cheap 64-bit
 * integer XOR, so two 32-bit halves give the same collision resistance for the
 * transposition table and repetition detection.
 */
const seedRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    // xorshift32
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
};

const next = seedRandom(0x9e3779b9);

const table = (size: number): Uint32Array => {
  const out = new Uint32Array(size);
  for (let i = 0; i < size; i++) out[i] = next();
  return out;
};

/** Indexed by [piece * 128 + square]; piece codes range 0..15. */
export const ZOBRIST_PIECE_LO = table(16 * 128);
export const ZOBRIST_PIECE_HI = table(16 * 128);
export const ZOBRIST_CASTLE_LO = table(16);
export const ZOBRIST_CASTLE_HI = table(16);
/** Indexed by en-passant file, 0..7. */
export const ZOBRIST_EP_LO = table(8);
export const ZOBRIST_EP_HI = table(8);
export const ZOBRIST_SIDE_LO = next();
export const ZOBRIST_SIDE_HI = next();
