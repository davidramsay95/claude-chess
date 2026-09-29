/**
 * Zobrist keys. Every key is a pair (lo: 32 bits, hi: 21 bits) so the combined
 * hash fits exactly in a JavaScript double (53 bits) while XOR still runs on
 * 32-bit integers. The generator is seeded so the main thread and the worker
 * agree on every key.
 */

const keyCount = 16 * 128 + 1 + 16 + 8;
const LO = new Int32Array(keyCount);
const HI = new Int32Array(keyCount);

let seed = 0x9e3779b9 | 0;
const next = (): number => {
  // xorshift32
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return seed | 0;
};

for (let i = 0; i < keyCount; i++) {
  LO[i] = next();
  HI[i] = next() & 0x1fffff;
}

const PIECE_BASE = 0;
const SIDE_INDEX = 16 * 128;
const CASTLE_BASE = SIDE_INDEX + 1;
const EP_BASE = CASTLE_BASE + 16;

export const pieceKeyIndex = (piece: number, square: number): number => PIECE_BASE + piece * 128 + square;
export const sideKeyIndex = (): number => SIDE_INDEX;
export const castleKeyIndex = (rights: number): number => CASTLE_BASE + rights;
export const epKeyIndex = (file: number): number => EP_BASE + file;

export const keyLo = (index: number): number => LO[index] as number;
export const keyHi = (index: number): number => HI[index] as number;

export const combineHash = (lo: number, hi: number): number => hi * 0x100000000 + (lo >>> 0);
