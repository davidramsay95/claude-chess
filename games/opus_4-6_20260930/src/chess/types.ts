export const EMPTY = 0;
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

export const WHITE = 0;
export const BLACK = 1;

export const W_PAWN = 1;
export const W_KNIGHT = 2;
export const W_BISHOP = 3;
export const W_ROOK = 4;
export const W_QUEEN = 5;
export const W_KING = 6;
export const B_PAWN = 9;
export const B_KNIGHT = 10;
export const B_BISHOP = 11;
export const B_ROOK = 12;
export const B_QUEEN = 13;
export const B_KING = 14;

export type Color = 0 | 1;
export type PieceType = 1 | 2 | 3 | 4 | 5 | 6;
export type Piece = number;
export type Square88 = number;

export const CASTLE_WK = 1;
export const CASTLE_WQ = 2;
export const CASTLE_BK = 4;
export const CASTLE_BQ = 8;

export const FLAG_CAPTURE = 1;
export const FLAG_EP = 2;
export const FLAG_CASTLE = 4;
export const FLAG_PROMOTE = 8;
export const FLAG_PAWN_DOUBLE = 16;

export interface Move {
  from: Square88;
  to: Square88;
  piece: Piece;
  captured: Piece;
  flags: number;
  promotion: PieceType | 0;
}

export interface BoardState {
  board: Uint8Array;
  turn: Color;
  castling: number;
  epSquare: number;
  halfmoveClock: number;
  fullmoveNumber: number;
  kings: [Square88, Square88];
}

export interface UndoInfo {
  move: Move;
  castling: number;
  epSquare: number;
  halfmoveClock: number;
  hash: number;
}

export function sq88(rank: number, file: number): Square88 {
  return (rank << 4) | file;
}

export function sqFile(sq: Square88): number {
  return sq & 0x0f;
}

export function sqRank(sq: Square88): number {
  return sq >> 4;
}

export function isOnBoard(sq: Square88): boolean {
  return (sq & 0x88) === 0;
}

export function pieceColor(p: Piece): Color {
  return (p >> 3) as Color;
}

export function pieceType(p: Piece): PieceType {
  return (p & 7) as PieceType;
}

export function makePiece(color: Color, type: PieceType): Piece {
  return (color << 3) | type;
}

export function sq88ToAlg(sq: Square88): string {
  return String.fromCharCode(97 + sqFile(sq)) + String(sqRank(sq) + 1);
}

export function algToSq88(alg: string): Square88 {
  const file = alg.charCodeAt(0) - 97;
  const rank = parseInt(alg[1]) - 1;
  return sq88(rank, file);
}

export function moveToUci(m: Move): string {
  let s = sq88ToAlg(m.from) + sq88ToAlg(m.to);
  if (m.promotion) {
    s += " nbrq"[m.promotion];
  }
  return s;
}

export function sq88To64(sq: Square88): number {
  return (sq >> 4) * 8 + (sq & 0x0f);
}

export function sq64To88(sq64: number): Square88 {
  return ((sq64 >> 3) << 4) | (sq64 & 7);
}

export const KNIGHT_OFFSETS = [-33, -31, -18, -14, 14, 18, 31, 33];
export const BISHOP_OFFSETS = [-17, -15, 15, 17];
export const ROOK_OFFSETS = [-16, -1, 1, 16];
export const QUEEN_OFFSETS = [-17, -15, -16, -1, 1, 15, 16, 17];
export const KING_OFFSETS = [-17, -15, -16, -1, 1, 15, 16, 17];

export type Difficulty = "easy" | "medium" | "hard" | "expert";

export interface GameState {
  version: 1;
  startFen: string;
  playerColor: "white" | "black";
  difficulty: Difficulty;
  moves: string[];
  resigned: boolean;
}
