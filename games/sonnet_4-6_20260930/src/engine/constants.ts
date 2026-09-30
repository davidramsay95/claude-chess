export const EMPTY = 0;

// White pieces 1-6, black pieces 7-12
export const W_PAWN = 1;
export const W_KNIGHT = 2;
export const W_BISHOP = 3;
export const W_ROOK = 4;
export const W_QUEEN = 5;
export const W_KING = 6;
export const B_PAWN = 7;
export const B_KNIGHT = 8;
export const B_BISHOP = 9;
export const B_ROOK = 10;
export const B_QUEEN = 11;
export const B_KING = 12;

export const WHITE = 0;
export const BLACK = 1;

export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

// Castling rights bitmask
export const CASTLE_WK = 1;
export const CASTLE_WQ = 2;
export const CASTLE_BK = 4;
export const CASTLE_BQ = 8;

// Move flags
export const FLAG_CAPTURE = 1;
export const FLAG_DOUBLE_PUSH = 2;
export const FLAG_EN_PASSANT = 4;
export const FLAG_CASTLE_KS = 8;
export const FLAG_CASTLE_QS = 16;

// Material values indexed by piece type (0=empty, 1=pawn, ..., 6=king)
export const PIECE_VALUE = [0, 100, 320, 330, 500, 900, 20000];

export function pieceType(p: number): number {
  return p > 6 ? p - 6 : p;
}

export function pieceColor(p: number): number {
  return p > 6 ? BLACK : WHITE;
}

export function makePiece(type: number, color: number): number {
  return color === WHITE ? type : type + 6;
}

export function squareFile(sq: number): number {
  return sq & 7;
}

export function squareRank(sq: number): number {
  return sq >> 3;
}

export function squareIndex(rank: number, file: number): number {
  return rank * 8 + file;
}

export function squareToAlgebraic(sq: number): string {
  return String.fromCharCode(97 + squareFile(sq)) + String.fromCharCode(49 + squareRank(sq));
}

export function algebraicToSquare(alg: string): number {
  const file = alg.charCodeAt(0) - 97;
  const rank = alg.charCodeAt(1) - 49;
  return rank * 8 + file;
}

const FEN_PIECE_MAP: Record<string, number> = {
  P: W_PAWN, N: W_KNIGHT, B: W_BISHOP, R: W_ROOK, Q: W_QUEEN, K: W_KING,
  p: B_PAWN, n: B_KNIGHT, b: B_BISHOP, r: B_ROOK, q: B_QUEEN, k: B_KING,
};

const PIECE_FEN_CHARS = [" ", "P", "N", "B", "R", "Q", "K", "p", "n", "b", "r", "q", "k"];
const PIECE_TYPE_CHARS = " pnbrqk";

export function fenCharToPiece(ch: string): number {
  return FEN_PIECE_MAP[ch] ?? EMPTY;
}

export function pieceToFenChar(p: number): string {
  return PIECE_FEN_CHARS[p] ?? " ";
}

export function uciCharToPieceType(ch: string): number {
  return PIECE_TYPE_CHARS.indexOf(ch);
}

export function pieceTypeToUciChar(pt: number): string {
  return PIECE_TYPE_CHARS[pt] ?? "";
}
