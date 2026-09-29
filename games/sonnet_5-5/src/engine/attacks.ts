/** Precomputed geometry shared by move generation and attack detection. */

/** Directions as [fileDelta, rankDelta]. First four are rook rays, last four bishop rays. */
export const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];
export const ROOK_DIRS = [0, 1, 2, 3] as const;
export const BISHOP_DIRS = [4, 5, 6, 7] as const;

const buildRays = (): Int8Array[][] =>
  Array.from({ length: 64 }, (_, sq) =>
    DIRECTIONS.map(([df, dr]) => {
      const ray: number[] = [];
      let file = (sq & 7) + df;
      let rank = (sq >> 3) + dr;
      while (file >= 0 && file < 8 && rank >= 0 && rank < 8) {
        ray.push(rank * 8 + file);
        file += df;
        rank += dr;
      }
      return Int8Array.from(ray);
    }),
  );

/** RAYS[square][direction] lists squares outward from `square`. */
export const RAYS = buildRays();

const buildJumps = (deltas: ReadonlyArray<readonly [number, number]>): Int8Array[] =>
  Array.from({ length: 64 }, (_, sq) => {
    const targets: number[] = [];
    for (const [df, dr] of deltas) {
      const file = (sq & 7) + df;
      const rank = (sq >> 3) + dr;
      if (file >= 0 && file < 8 && rank >= 0 && rank < 8) targets.push(rank * 8 + file);
    }
    return Int8Array.from(targets);
  });

export const KNIGHT_TARGETS = buildJumps([
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
]);
export const KING_TARGETS = buildJumps([
  [0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1],
]);

/** Squares from which a pawn of `color` attacks `square` (index [color][square]). */
export const PAWN_ATTACKERS: Int8Array[][] = [0, 1].map((color) =>
  Array.from({ length: 64 }, (_, sq) => {
    // A white pawn attacks upward, so it sits one rank below the target.
    const rank = (sq >> 3) + (color === 0 ? -1 : 1);
    const result: number[] = [];
    if (rank >= 0 && rank < 8) {
      for (const df of [-1, 1]) {
        const file = (sq & 7) + df;
        if (file >= 0 && file < 8) result.push(rank * 8 + file);
      }
    }
    return Int8Array.from(result);
  }),
);
