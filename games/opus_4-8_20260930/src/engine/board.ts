import {
  BISHOP,
  BLACK,
  CASTLE_BK,
  CASTLE_BQ,
  CASTLE_WK,
  CASTLE_WQ,
  Color,
  EMPTY,
  FLAG_CASTLE_KING,
  FLAG_CASTLE_QUEEN,
  FLAG_EN_PASSANT,
  KING,
  KNIGHT,
  makePiece,
  Move,
  PAWN,
  pieceColor,
  pieceType,
  PieceType,
  QUEEN,
  ROOK,
  WHITE,
} from "./types.ts";

// --- 0x88 square helpers -------------------------------------------------

export function sq0x88(file: number, rank: number): number {
  return rank * 16 + file;
}
export function fileOf(sq: number): number {
  return sq & 7;
}
export function rankOf(sq: number): number {
  return sq >> 4;
}
export function onBoard(sq: number): boolean {
  return (sq & 0x88) === 0;
}

/** Convert a 0x88 square to algebraic ("e4"). */
export function squareToAlgebraic(sq: number): string {
  return String.fromCharCode(97 + fileOf(sq)) + String.fromCharCode(49 + rankOf(sq));
}

/** Convert algebraic ("e4") to a 0x88 square, or -1 if malformed. */
export function algebraicToSquare(text: string): number {
  if (text.length !== 2) return -1;
  const file = text.charCodeAt(0) - 97;
  const rank = text.charCodeAt(1) - 49;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return -1;
  return sq0x88(file, rank);
}

// --- Attack offsets ------------------------------------------------------

export const KNIGHT_OFFSETS = [31, 33, 14, 18, -31, -33, -14, -18];
export const KING_OFFSETS = [16, -16, 1, -1, 17, 15, -17, -15];
export const BISHOP_DIRS = [17, 15, -17, -15];
export const ROOK_DIRS = [16, -16, 1, -1];

const PIECE_LETTERS: Record<number, string> = {
  [PAWN]: "p",
  [KNIGHT]: "n",
  [BISHOP]: "b",
  [ROOK]: "r",
  [QUEEN]: "q",
  [KING]: "k",
};
const LETTER_TO_TYPE: Record<string, PieceType> = {
  p: PAWN,
  n: KNIGHT,
  b: BISHOP,
  r: ROOK,
  q: QUEEN,
  k: KING,
};

interface Undo {
  castling: number;
  ep: number;
  halfmove: number;
}

/**
 * The complete state of a chess position, using a 0x88 board.
 * Provides FEN parsing, make/unmake and attack detection; move generation
 * lives in `movegen.ts` and operates on this class.
 */
export class Board {
  squares: Int8Array = new Int8Array(128);
  turn: Color = WHITE;
  castling = 0;
  ep = -1; // 0x88 en-passant target square, or -1
  halfmove = 0;
  fullmove = 1;
  kingSq: [number, number] = [-1, -1];
  private undoStack: Undo[] = [];

  static fromFen(fen: string): Board {
    const board = new Board();
    board.setFen(fen);
    return board;
  }

  setFen(fen: string): void {
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 4) throw new Error(`Invalid FEN: ${fen}`);
    const [placement, active, castling, epField] = parts;
    this.squares = new Int8Array(128);
    this.kingSq = [-1, -1];

    const rows = placement.split("/");
    if (rows.length !== 8) throw new Error(`Invalid FEN placement: ${placement}`);
    for (let row = 0; row < 8; row++) {
      const rank = 7 - row; // FEN lists rank 8 first
      let file = 0;
      for (const ch of rows[row]) {
        if (ch >= "1" && ch <= "8") {
          file += ch.charCodeAt(0) - 48;
        } else {
          const lower = ch.toLowerCase();
          const type = LETTER_TO_TYPE[lower];
          if (!type) throw new Error(`Invalid FEN piece: ${ch}`);
          const color: Color = ch === lower ? BLACK : WHITE;
          const sq = sq0x88(file, rank);
          this.squares[sq] = makePiece(type, color);
          if (type === KING) this.kingSq[color] = sq;
          file++;
        }
      }
      if (file !== 8) throw new Error(`Invalid FEN row width: ${rows[row]}`);
    }

    this.turn = active === "b" ? BLACK : WHITE;
    this.castling = 0;
    if (castling.includes("K")) this.castling |= CASTLE_WK;
    if (castling.includes("Q")) this.castling |= CASTLE_WQ;
    if (castling.includes("k")) this.castling |= CASTLE_BK;
    if (castling.includes("q")) this.castling |= CASTLE_BQ;
    this.ep = epField === "-" ? -1 : algebraicToSquare(epField);
    this.halfmove = parts[4] ? parseInt(parts[4], 10) : 0;
    this.fullmove = parts[5] ? parseInt(parts[5], 10) : 1;
    this.undoStack = [];
  }

  toFen(): string {
    let placement = "";
    for (let rank = 7; rank >= 0; rank--) {
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const piece = this.squares[sq0x88(file, rank)];
        if (piece === EMPTY) {
          empty++;
        } else {
          if (empty > 0) {
            placement += empty;
            empty = 0;
          }
          const letter = PIECE_LETTERS[pieceType(piece)];
          placement += pieceColor(piece) === WHITE ? letter.toUpperCase() : letter;
        }
      }
      if (empty > 0) placement += empty;
      if (rank > 0) placement += "/";
    }

    const active = this.turn === WHITE ? "w" : "b";
    let castling = "";
    if (this.castling & CASTLE_WK) castling += "K";
    if (this.castling & CASTLE_WQ) castling += "Q";
    if (this.castling & CASTLE_BK) castling += "k";
    if (this.castling & CASTLE_BQ) castling += "q";
    if (castling === "") castling = "-";
    const epText = this.ep < 0 ? "-" : squareToAlgebraic(this.ep);
    return `${placement} ${active} ${castling} ${epText} ${this.halfmove} ${this.fullmove}`;
  }

  /**
   * A compact key of everything that defines position identity for the
   * threefold-repetition rule: pieces, side to move, castling rights and a
   * legal en-passant target.
   */
  repetitionKey(): string {
    let key = "";
    for (let rank = 7; rank >= 0; rank--) {
      for (let file = 0; file < 8; file++) {
        key += String.fromCharCode(this.squares[sq0x88(file, rank)] + 33);
      }
    }
    return `${key}|${this.turn}|${this.castling}|${this.ep}`;
  }

  /** Is `sq` attacked by any piece of colour `by`? */
  isSquareAttacked(sq: number, by: Color): boolean {
    const squares = this.squares;

    // Pawn attacks: a pawn of colour `by` sits on the diagonal behind `sq`.
    if (by === WHITE) {
      const wp = makePiece(PAWN, WHITE);
      if (onBoard(sq - 17) && squares[sq - 17] === wp) return true;
      if (onBoard(sq - 15) && squares[sq - 15] === wp) return true;
    } else {
      const bp = makePiece(PAWN, BLACK);
      if (onBoard(sq + 17) && squares[sq + 17] === bp) return true;
      if (onBoard(sq + 15) && squares[sq + 15] === bp) return true;
    }

    // Knight attacks.
    const knight = makePiece(KNIGHT, by);
    for (const off of KNIGHT_OFFSETS) {
      const t = sq + off;
      if (onBoard(t) && squares[t] === knight) return true;
    }

    // King attacks.
    const king = makePiece(KING, by);
    for (const off of KING_OFFSETS) {
      const t = sq + off;
      if (onBoard(t) && squares[t] === king) return true;
    }

    // Sliding attacks: bishops/queens on diagonals, rooks/queens on files/ranks.
    const bishop = makePiece(BISHOP, by);
    const queen = makePiece(QUEEN, by);
    for (const dir of BISHOP_DIRS) {
      let t = sq + dir;
      while (onBoard(t)) {
        const piece = squares[t];
        if (piece !== EMPTY) {
          if (piece === bishop || piece === queen) return true;
          break;
        }
        t += dir;
      }
    }
    const rook = makePiece(ROOK, by);
    for (const dir of ROOK_DIRS) {
      let t = sq + dir;
      while (onBoard(t)) {
        const piece = squares[t];
        if (piece !== EMPTY) {
          if (piece === rook || piece === queen) return true;
          break;
        }
        t += dir;
      }
    }
    return false;
  }

  /** Is the side to move (or `color` if given) currently in check? */
  inCheck(color: Color = this.turn): boolean {
    const king = this.kingSq[color];
    if (king < 0) return false;
    return this.isSquareAttacked(king, (color ^ 1) as Color);
  }

  /** Apply a move, mutating the board and pushing undo state. */
  make(move: Move): void {
    const squares = this.squares;
    this.undoStack.push({ castling: this.castling, ep: this.ep, halfmove: this.halfmove });

    const from = move.from;
    const to = move.to;
    const piece = move.piece;
    const color = pieceColor(piece);
    const type = pieceType(piece);

    // Halfmove clock: reset on pawn move or capture, otherwise increment.
    if (type === PAWN || move.captured !== EMPTY) this.halfmove = 0;
    else this.halfmove++;

    // Remove any captured pawn that sits behind the target on en passant.
    if (move.flag === FLAG_EN_PASSANT) {
      const capturedSq = color === WHITE ? to - 16 : to + 16;
      squares[capturedSq] = EMPTY;
    }

    // Move the piece.
    squares[from] = EMPTY;
    squares[to] = move.promotion ? makePiece(move.promotion, color) : piece;
    if (type === KING) this.kingSq[color] = to;

    // Move the rook when castling.
    if (move.flag === FLAG_CASTLE_KING) {
      const rookFrom = to + 1;
      const rookTo = to - 1;
      squares[rookTo] = squares[rookFrom];
      squares[rookFrom] = EMPTY;
    } else if (move.flag === FLAG_CASTLE_QUEEN) {
      const rookFrom = to - 2;
      const rookTo = to + 1;
      squares[rookTo] = squares[rookFrom];
      squares[rookFrom] = EMPTY;
    }

    // Update castling rights when kings or rooks leave home, or rooks are captured.
    this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];

    // Set the en-passant target only after a double pawn push.
    this.ep = -1;
    if (move.flag === 1 /* FLAG_DOUBLE_PUSH */) {
      this.ep = color === WHITE ? from + 16 : from - 16;
    }

    if (color === BLACK) this.fullmove++;
    this.turn = (color ^ 1) as Color;
  }

  /** Reverse the last move applied with `make`. */
  unmake(move: Move): void {
    const squares = this.squares;
    const undo = this.undoStack.pop();
    if (!undo) throw new Error("unmake called with empty undo stack");

    const from = move.from;
    const to = move.to;
    const piece = move.piece;
    const color = pieceColor(piece);

    this.turn = color;
    if (color === BLACK) this.fullmove--;
    this.castling = undo.castling;
    this.ep = undo.ep;
    this.halfmove = undo.halfmove;

    // Restore the moving piece (undoing promotion by writing the pawn back).
    squares[from] = piece;
    squares[to] = move.captured;
    if (pieceType(piece) === KING) this.kingSq[color] = from;

    if (move.flag === FLAG_EN_PASSANT) {
      // The capture square was empty; the captured pawn sat behind `to`.
      squares[to] = EMPTY;
      const capturedSq = color === WHITE ? to - 16 : to + 16;
      squares[capturedSq] = makePiece(PAWN, (color ^ 1) as Color);
    } else if (move.flag === FLAG_CASTLE_KING) {
      const rookFrom = to + 1;
      const rookTo = to - 1;
      squares[rookFrom] = squares[rookTo];
      squares[rookTo] = EMPTY;
    } else if (move.flag === FLAG_CASTLE_QUEEN) {
      const rookFrom = to - 2;
      const rookTo = to + 1;
      squares[rookFrom] = squares[rookTo];
      squares[rookTo] = EMPTY;
    }
  }
}

/**
 * Per-square castling mask. A move touching a square ANDs the rights with the
 * mask, which clears exactly the right that the king/rook home square controls.
 */
const CASTLE_MASK = new Int8Array(128).fill(0b1111);
CASTLE_MASK[sq0x88(4, 0)] = ~(CASTLE_WK | CASTLE_WQ) & 0b1111; // e1
CASTLE_MASK[sq0x88(0, 0)] = ~CASTLE_WQ & 0b1111; // a1
CASTLE_MASK[sq0x88(7, 0)] = ~CASTLE_WK & 0b1111; // h1
CASTLE_MASK[sq0x88(4, 7)] = ~(CASTLE_BK | CASTLE_BQ) & 0b1111; // e8
CASTLE_MASK[sq0x88(0, 7)] = ~CASTLE_BQ & 0b1111; // a8
CASTLE_MASK[sq0x88(7, 7)] = ~CASTLE_BK & 0b1111; // h8
