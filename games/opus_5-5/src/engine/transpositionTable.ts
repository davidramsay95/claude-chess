import type { Move } from "../chess/move";

/** The stored score is the true score. */
export const BOUND_EXACT = 1;
/** The true score is at least the stored score (the search failed high). */
export const BOUND_LOWER = 2;
/** The true score is at most the stored score (the search failed low). */
export const BOUND_UPPER = 3;

/**
 * Fixed-size hash table of search results in parallel typed arrays, so probing never allocates.
 * The low Zobrist half picks the slot and the high half verifies it, giving an effective key of
 * `bits + 32` bits. A bound of 0 marks an empty slot.
 */
export class TranspositionTable {
  private readonly mask: number;
  private readonly keys: Int32Array;
  private readonly moves: Int32Array;
  private readonly scores: Int16Array;
  private readonly depths: Int8Array;
  private readonly bounds: Uint8Array;

  /** Creates a table with `2 ** bits` slots (about 12 bytes each). */
  constructor(bits: number) {
    const size = 1 << bits;
    this.mask = size - 1;
    this.keys = new Int32Array(size);
    this.moves = new Int32Array(size);
    this.scores = new Int16Array(size);
    this.depths = new Int8Array(size);
    this.bounds = new Uint8Array(size);
  }

  /** Returns the slot index holding this position, or -1 when it is not stored. */
  probe(hashLo: number, hashHi: number): number {
    const index = hashLo & this.mask;
    return this.bounds[index] !== 0 && this.keys[index] === hashHi ? index : -1;
  }

  /** Stores a result, keeping an existing deeper result for the same position unless the new one is exact. */
  store(hashLo: number, hashHi: number, depth: number, bound: number, score: number, move: Move): void {
    const index = hashLo & this.mask;
    const samePosition = this.bounds[index] !== 0 && this.keys[index] === hashHi;
    if (samePosition && depth < this.depths[index] && bound !== BOUND_EXACT) return;
    this.keys[index] = hashHi;
    // Keep the old best move when a fail-low search found none, so move ordering still benefits.
    if (move !== 0 || !samePosition) this.moves[index] = move;
    this.scores[index] = score;
    this.depths[index] = depth;
    this.bounds[index] = bound;
  }

  moveAt(index: number): Move {
    return this.moves[index];
  }

  scoreAt(index: number): number {
    return this.scores[index];
  }

  depthAt(index: number): number {
    return this.depths[index];
  }

  boundAt(index: number): number {
    return this.bounds[index];
  }

  clear(): void {
    this.bounds.fill(0);
  }
}
