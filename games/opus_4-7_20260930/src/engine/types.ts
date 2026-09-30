export type Color = "w" | "b";

// Piece codes: uppercase = white, lowercase = black.
// P N B R Q K   p n b r q k
export type Piece = "P" | "N" | "B" | "R" | "Q" | "K" | "p" | "n" | "b" | "r" | "q" | "k";

export type Square = number; // 0..63, where index = rank * 8 + file, rank 0 = rank 1 (white back).

export interface Move {
  from: Square;
  to: Square;
  promo?: "q" | "r" | "b" | "n";
}

export interface DetailedMove extends Move {
  piece: Piece;
  captured?: Piece;
  isEnPassant: boolean;
  isCastle: "K" | "Q" | "k" | "q" | null;
  isDoublePush: boolean;
}

// Castling rights bit flags
export const CR_WK = 1;
export const CR_WQ = 2;
export const CR_BK = 4;
export const CR_BQ = 8;

export interface Position {
  board: (Piece | null)[]; // length 64
  turn: Color;
  castling: number; // bitmask
  epTarget: Square | null; // square behind a pawn that just double-pushed
  halfmoveClock: number;
  fullmoveNumber: number;
}

export function colorOf(p: Piece): Color {
  return p >= "A" && p <= "Z" ? "w" : "b";
}

export function isWhitePiece(p: Piece): boolean {
  return p >= "A" && p <= "Z";
}

export function pieceType(p: Piece): "p" | "n" | "b" | "r" | "q" | "k" {
  return p.toLowerCase() as "p" | "n" | "b" | "r" | "q" | "k";
}

export function fileOf(sq: Square): number {
  return sq & 7;
}

export function rankOf(sq: Square): number {
  return sq >> 3;
}

export function squareOf(file: number, rank: number): Square {
  return rank * 8 + file;
}

export function algebraicOf(sq: Square): string {
  const f = fileOf(sq);
  const r = rankOf(sq);
  return String.fromCharCode(97 + f) + (r + 1).toString();
}

export function squareFromAlgebraic(s: string): Square {
  const f = s.charCodeAt(0) - 97;
  const r = parseInt(s[1], 10) - 1;
  return squareOf(f, r);
}
