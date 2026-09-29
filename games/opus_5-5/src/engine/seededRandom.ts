/** A source of uniform random numbers in [0, 1), like `Math.random`. */
export type Rng = () => number;

/** Deterministic mulberry32 generator, so randomised engine behaviour can be reproduced in tests. */
export const createSeededRandom = (seed: number): Rng => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};
