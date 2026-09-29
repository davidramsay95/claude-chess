export interface MovePair {
  number: number;
  white: string;
  black?: string;
}

/** Groups SAN moves into numbered pairs for a two-column move list. Assumes White moved first. */
export const toMovePairs = (sans: readonly string[]): MovePair[] =>
  Array.from({ length: Math.ceil(sans.length / 2) }, (_, index) => {
    const black = sans[index * 2 + 1];
    return { number: index + 1, white: sans[index * 2], ...(black ? { black } : {}) };
  });
