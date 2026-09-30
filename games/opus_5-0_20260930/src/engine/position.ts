/**
 * Board representation, move generation and make/unmake for a complete chess
 * rule set. The board is a 0x88 array: a square is off the board exactly when
 * `(square & 0x88) !== 0`, which removes every edge test from the sliding-piece
 * loops. Nothing in this module touches the DOM, so it runs unchanged in a Web
 * Worker and under Node for the tests.
 */

export const WHITE = 0;
export const BLACK = 1;
export type Color = typeof WHITE | typeof BLACK;

export const EMPTY = 0;
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;
export type PieceType = 1 | 2 | 3 | 4 | 5 | 6;

/** Castling right bits, in FEN order. */
export const CASTLE_WK = 1;
export const CASTLE_WQ = 2;
export const CASTLE_BK = 4;
export const CASTLE_BQ = 8;

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const A1 = 0x00;
export const C1 = 0x02;
export const D1 = 0x03;
export const E1 = 0x04;
export const F1 = 0x05;
export const G1 = 0x06;
export const H1 = 0x07;
export const A8 = 0x70;
export const C8 = 0x72;
export const D8 = 0x73;
export const E8 = 0x74;
export const F8 = 0x75;
export const G8 = 0x76;
export const H8 = 0x77;

export const FLAG_EP = 1;
export const FLAG_CASTLE = 2;
export const FLAG_DOUBLE = 4;

const PIECE_LETTERS = ".pnbrqk";

export function makePiece(type: PieceType, color: Color): number {
  return type | (color << 3);
}
export function typeOf(piece: number): number {
  return piece & 7;
}
export function colorOf(piece: number): Color {
  return ((piece >> 3) & 1) as Color;
}
export function fileOf(square: number): number {
  return square & 7;
}
export function rankOf(square: number): number {
  return square >> 4;
}
export function onBoard(square: number): boolean {
  return (square & 0x88) === 0;
}

export function algebraic(square: number): string {
  return String.fromCharCode(97 + fileOf(square)) + String(rankOf(square) + 1);
}

export function squareFromAlgebraic(name: string): number {
  if (name.length !== 2) return -1;
  const file = name.charCodeAt(0) - 97;
  const rank = name.charCodeAt(1) - 49;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return -1;
  return rank * 16 + file;
}

/* ---------------------------------------------------------------- moves --- */

/** from:0-6 | to:7-13 | captured:14-17 | promotion:18-21 | flags:22-25 */
export function encodeMove(
  from: number,
  to: number,
  captured: number,
  promotion: number,
  flags: number,
): number {
  return from | (to << 7) | (captured << 14) | (promotion << 18) | (flags << 22);
}
export function moveFrom(move: number): number {
  return move & 0x7f;
}
export function moveTo(move: number): number {
  return (move >> 7) & 0x7f;
}
export function moveCaptured(move: number): number {
  return (move >> 14) & 0xf;
}
export function movePromotion(move: number): number {
  return (move >> 18) & 0xf;
}
export function moveFlags(move: number): number {
  return (move >> 22) & 0xf;
}
export function moveToUci(move: number): string {
  const promotion = movePromotion(move);
  return (
    algebraic(moveFrom(move)) +
    algebraic(moveTo(move)) +
    (promotion ? PIECE_LETTERS[promotion] : "")
  );
}

/* ------------------------------------------------------------- geometry --- */

const KNIGHT_DIRS = [33, 31, 18, 14, -33, -31, -18, -14];
const BISHOP_DIRS = [17, 15, -15, -17];
const ROOK_DIRS = [16, 1, -1, -16];
const KING_DIRS = [17, 16, 15, 1, -1, -15, -16, -17];

const CASTLE_MASK = new Int8Array(128).fill(0xf);
CASTLE_MASK[A1] = 0xf & ~CASTLE_WQ;
CASTLE_MASK[H1] = 0xf & ~CASTLE_WK;
CASTLE_MASK[E1] = 0xf & ~(CASTLE_WK | CASTLE_WQ);
CASTLE_MASK[A8] = 0xf & ~CASTLE_BQ;
CASTLE_MASK[H8] = 0xf & ~CASTLE_BK;
CASTLE_MASK[E8] = 0xf & ~(CASTLE_BK | CASTLE_BQ);

/* -------------------------------------------------------------- zobrist --- */

function xorshift32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state >>> 0;
  };
}

const rng = xorshift32(0x9e3779b9);
const Z_PIECE_HI = new Int32Array(15 * 128);
const Z_PIECE_LO = new Int32Array(15 * 128);
for (let i = 0; i < Z_PIECE_HI.length; i++) {
  Z_PIECE_HI[i] = rng() | 0;
  Z_PIECE_LO[i] = rng() | 0;
}
const Z_CASTLE_HI = new Int32Array(16);
const Z_CASTLE_LO = new Int32Array(16);
for (let i = 0; i < 16; i++) {
  Z_CASTLE_HI[i] = rng() | 0;
  Z_CASTLE_LO[i] = rng() | 0;
}
const Z_EP_HI = new Int32Array(8);
const Z_EP_LO = new Int32Array(8);
for (let i = 0; i < 8; i++) {
  Z_EP_HI[i] = rng() | 0;
  Z_EP_LO[i] = rng() | 0;
}
const Z_SIDE_HI = rng() | 0;
const Z_SIDE_LO = rng() | 0;

const MAX_PLY = 1024;

export class Position {
  readonly board = new Int8Array(128);
  turn: Color = WHITE;
  castling = 0;
  epSquare = -1;
  halfmoveClock = 0;
  fullmoveNumber = 1;
  readonly kingSquare = new Int32Array(2);
  hashHi = 0;
  hashLo = 0;

  private ply = 0;
  private readonly uMove = new Int32Array(MAX_PLY);
  private readonly uCastling = new Int8Array(MAX_PLY);
  private readonly uEp = new Int8Array(MAX_PLY);
  private readonly uHalfmove = new Int16Array(MAX_PLY);
  private readonly uFullmove = new Int16Array(MAX_PLY);
  private readonly uHashHi = new Int32Array(MAX_PLY);
  private readonly uHashLo = new Int32Array(MAX_PLY);

  static fromFen(fen: string): Position {
    const pos = new Position();
    pos.setFen(fen);
    return pos;
  }

  clone(): Position {
    const copy = new Position();
    copy.board.set(this.board);
    copy.turn = this.turn;
    copy.castling = this.castling;
    copy.epSquare = this.epSquare;
    copy.halfmoveClock = this.halfmoveClock;
    copy.fullmoveNumber = this.fullmoveNumber;
    copy.kingSquare.set(this.kingSquare);
    copy.hashHi = this.hashHi;
    copy.hashLo = this.hashLo;
    return copy;
  }

  pieceAt(square: number): number {
    return this.board[square];
  }
  pieceTypeAt(square: number): number {
    return this.board[square] & 7;
  }
  colorAt(square: number): number {
    const piece = this.board[square];
    return piece === 0 ? -1 : (piece >> 3) & 1;
  }
  /** Stable key for repetition detection: position, side, castling and ep. */
  key(): string {
    return `${(this.hashHi >>> 0).toString(36)}:${(this.hashLo >>> 0).toString(36)}`;
  }

  /* ------------------------------------------------------------- FEN --- */

  setFen(fen: string): void {
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 4) throw new Error("FEN must have at least four fields");
    const [placement, side, castling, ep] = parts as [string, string, string, string];

    const ranks = placement.split("/");
    if (ranks.length !== 8) throw new Error("FEN board must have eight ranks");

    this.board.fill(0);
    for (let r = 0; r < 8; r++) {
      const row = ranks[r];
      let file = 0;
      const rank = 7 - r;
      for (const ch of row) {
        if (ch >= "1" && ch <= "8") {
          file += ch.charCodeAt(0) - 48;
          continue;
        }
        const type = PIECE_LETTERS.indexOf(ch.toLowerCase());
        if (type <= 0) throw new Error(`Unknown piece '${ch}' in FEN`);
        if (file > 7) throw new Error("FEN rank overflows eight files");
        const color: Color = ch === ch.toUpperCase() ? WHITE : BLACK;
        if (type === PAWN && (rank === 0 || rank === 7)) {
          throw new Error("FEN places a pawn on the back rank");
        }
        this.board[rank * 16 + file] = makePiece(type as PieceType, color);
        file++;
      }
      if (file !== 8) throw new Error("FEN rank does not describe eight files");
    }

    if (side !== "w" && side !== "b") throw new Error("FEN side to move must be w or b");
    this.turn = side === "w" ? WHITE : BLACK;

    this.castling = 0;
    if (castling !== "-") {
      for (const ch of castling) {
        if (ch === "K") this.castling |= CASTLE_WK;
        else if (ch === "Q") this.castling |= CASTLE_WQ;
        else if (ch === "k") this.castling |= CASTLE_BK;
        else if (ch === "q") this.castling |= CASTLE_BQ;
        else throw new Error(`Unknown castling flag '${ch}' in FEN`);
      }
    }

    this.epSquare = ep === "-" ? -1 : squareFromAlgebraic(ep);
    if (ep !== "-" && this.epSquare === -1) throw new Error("FEN en passant square is not a square");

    this.halfmoveClock = parts.length > 4 ? Number(parts[4]) : 0;
    this.fullmoveNumber = parts.length > 5 ? Number(parts[5]) : 1;
    if (!Number.isInteger(this.halfmoveClock) || this.halfmoveClock < 0) {
      throw new Error("FEN halfmove clock is not a non-negative integer");
    }
    if (!Number.isInteger(this.fullmoveNumber) || this.fullmoveNumber < 1) {
      throw new Error("FEN fullmove number is not a positive integer");
    }

    this.kingSquare[WHITE] = -1;
    this.kingSquare[BLACK] = -1;
    for (let square = 0; square < 128; square++) {
      if (square & 0x88) continue;
      const piece = this.board[square];
      if (piece && (piece & 7) === KING) {
        const color = (piece >> 3) & 1;
        if (this.kingSquare[color] !== -1) throw new Error("FEN has more than one king per side");
        this.kingSquare[color] = square;
      }
    }
    if (this.kingSquare[WHITE] === -1 || this.kingSquare[BLACK] === -1) {
      throw new Error("FEN must place a king for each side");
    }
    if (this.isSquareAttacked(this.kingSquare[1 - this.turn], this.turn)) {
      throw new Error("FEN leaves the side that just moved in check");
    }

    this.ply = 0;
    this.recomputeHash();
  }

  toFen(): string {
    const rows: string[] = [];
    for (let rank = 7; rank >= 0; rank--) {
      let row = "";
      let run = 0;
      for (let file = 0; file < 8; file++) {
        const piece = this.board[rank * 16 + file];
        if (piece === 0) {
          run++;
          continue;
        }
        if (run) {
          row += String(run);
          run = 0;
        }
        const letter = PIECE_LETTERS[piece & 7];
        row += ((piece >> 3) & 1) === WHITE ? letter.toUpperCase() : letter;
      }
      if (run) row += String(run);
      rows.push(row);
    }
    let rights = "";
    if (this.castling & CASTLE_WK) rights += "K";
    if (this.castling & CASTLE_WQ) rights += "Q";
    if (this.castling & CASTLE_BK) rights += "k";
    if (this.castling & CASTLE_BQ) rights += "q";
    return [
      rows.join("/"),
      this.turn === WHITE ? "w" : "b",
      rights || "-",
      this.epSquare === -1 ? "-" : algebraic(this.epSquare),
      String(this.halfmoveClock),
      String(this.fullmoveNumber),
    ].join(" ");
  }

  private recomputeHash(): void {
    let hi = 0;
    let lo = 0;
    for (let square = 0; square < 128; square++) {
      if (square & 0x88) continue;
      const piece = this.board[square];
      if (!piece) continue;
      const index = piece * 128 + square;
      hi ^= Z_PIECE_HI[index];
      lo ^= Z_PIECE_LO[index];
    }
    hi ^= Z_CASTLE_HI[this.castling];
    lo ^= Z_CASTLE_LO[this.castling];
    if (this.epSquare !== -1) {
      hi ^= Z_EP_HI[fileOf(this.epSquare)];
      lo ^= Z_EP_LO[fileOf(this.epSquare)];
    }
    if (this.turn === BLACK) {
      hi ^= Z_SIDE_HI;
      lo ^= Z_SIDE_LO;
    }
    this.hashHi = hi;
    this.hashLo = lo;
  }

  private xorPiece(piece: number, square: number): void {
    const index = piece * 128 + square;
    this.hashHi ^= Z_PIECE_HI[index];
    this.hashLo ^= Z_PIECE_LO[index];
  }

  /* ----------------------------------------------------------- attacks --- */

  isSquareAttacked(square: number, by: Color): boolean {
    const board = this.board;
    const colorBit = by << 3;

    // Pawns push away from their own side, so look back along the capture rays.
    const pawnStep = by === WHITE ? -16 : 16;
    for (const side of [-1, 1]) {
      const origin = square + pawnStep + side;
      if ((origin & 0x88) === 0 && board[origin] === (PAWN | colorBit)) return true;
    }

    for (const dir of KNIGHT_DIRS) {
      const origin = square + dir;
      if ((origin & 0x88) === 0 && board[origin] === (KNIGHT | colorBit)) return true;
    }

    for (const dir of KING_DIRS) {
      const origin = square + dir;
      if ((origin & 0x88) === 0 && board[origin] === (KING | colorBit)) return true;
    }

    for (const dir of BISHOP_DIRS) {
      for (let origin = square + dir; (origin & 0x88) === 0; origin += dir) {
        const piece = board[origin];
        if (piece === 0) continue;
        if (piece === (BISHOP | colorBit) || piece === (QUEEN | colorBit)) return true;
        break;
      }
    }

    for (const dir of ROOK_DIRS) {
      for (let origin = square + dir; (origin & 0x88) === 0; origin += dir) {
        const piece = board[origin];
        if (piece === 0) continue;
        if (piece === (ROOK | colorBit) || piece === (QUEEN | colorBit)) return true;
        break;
      }
    }

    return false;
  }

  isCheck(): boolean {
    return this.isSquareAttacked(this.kingSquare[this.turn], (1 - this.turn) as Color);
  }

  /* -------------------------------------------------------- generation --- */

  /**
   * Pseudo-legal moves for the side to move. Castling is only emitted when it
   * is fully legal, because the "may not pass through check" rule cannot be
   * detected by the usual leaves-own-king-in-check filter.
   */
  generateMoves(capturesOnly = false): number[] {
    const moves: number[] = [];
    const board = this.board;
    const us = this.turn;
    const them = (1 - us) as Color;
    const ourBit = us << 3;
    const forward = us === WHITE ? 16 : -16;
    const startRank = us === WHITE ? 1 : 6;
    const promoRank = us === WHITE ? 7 : 0;

    for (let from = 0; from < 128; from++) {
      if (from & 0x88) continue;
      const piece = board[from];
      if (piece === 0 || ((piece >> 3) & 1) !== us) continue;
      const type = piece & 7;

      if (type === PAWN) {
        const one = from + forward;
        if ((one & 0x88) === 0 && board[one] === 0) {
          if (rankOf(one) === promoRank) {
            if (!capturesOnly) {
              for (const promo of [QUEEN, ROOK, BISHOP, KNIGHT]) {
                moves.push(encodeMove(from, one, 0, promo, 0));
              }
            } else {
              moves.push(encodeMove(from, one, 0, QUEEN, 0));
            }
          } else if (!capturesOnly) {
            moves.push(encodeMove(from, one, 0, 0, 0));
            const two = one + forward;
            if (rankOf(from) === startRank && board[two] === 0) {
              moves.push(encodeMove(from, two, 0, 0, FLAG_DOUBLE));
            }
          }
        }
        for (const side of [-1, 1]) {
          const to = from + forward + side;
          if (to & 0x88) continue;
          const target = board[to];
          if (target !== 0 && ((target >> 3) & 1) === them) {
            if (rankOf(to) === promoRank) {
              for (const promo of [QUEEN, ROOK, BISHOP, KNIGHT]) {
                moves.push(encodeMove(from, to, target, promo, 0));
              }
            } else {
              moves.push(encodeMove(from, to, target, 0, 0));
            }
          } else if (to === this.epSquare && target === 0) {
            moves.push(encodeMove(from, to, PAWN | (them << 3), 0, FLAG_EP));
          }
        }
        continue;
      }

      if (type === KNIGHT || type === KING) {
        const dirs = type === KNIGHT ? KNIGHT_DIRS : KING_DIRS;
        for (const dir of dirs) {
          const to = from + dir;
          if (to & 0x88) continue;
          const target = board[to];
          if (target !== 0 && ((target >> 3) & 1) === us) continue;
          if (capturesOnly && target === 0) continue;
          moves.push(encodeMove(from, to, target, 0, 0));
        }
        continue;
      }

      const dirs = type === BISHOP ? BISHOP_DIRS : type === ROOK ? ROOK_DIRS : KING_DIRS;
      for (const dir of dirs) {
        for (let to = from + dir; (to & 0x88) === 0; to += dir) {
          const target = board[to];
          if (target === 0) {
            if (!capturesOnly) moves.push(encodeMove(from, to, 0, 0, 0));
            continue;
          }
          if (((target >> 3) & 1) === them) moves.push(encodeMove(from, to, target, 0, 0));
          break;
        }
      }
    }

    if (!capturesOnly) this.generateCastles(moves, us, them, ourBit);
    return moves;
  }

  private generateCastles(moves: number[], us: Color, them: Color, ourBit: number): void {
    const board = this.board;
    const king = us === WHITE ? E1 : E8;
    if (board[king] !== (KING | ourBit)) return;
    const kingSide = us === WHITE ? CASTLE_WK : CASTLE_BK;
    const queenSide = us === WHITE ? CASTLE_WQ : CASTLE_BQ;
    if (!(this.castling & (kingSide | queenSide))) return;
    if (this.isSquareAttacked(king, them)) return;

    if (
      this.castling & kingSide &&
      board[king + 1] === 0 &&
      board[king + 2] === 0 &&
      !this.isSquareAttacked(king + 1, them) &&
      !this.isSquareAttacked(king + 2, them)
    ) {
      moves.push(encodeMove(king, king + 2, 0, 0, FLAG_CASTLE));
    }
    if (
      this.castling & queenSide &&
      board[king - 1] === 0 &&
      board[king - 2] === 0 &&
      board[king - 3] === 0 &&
      !this.isSquareAttacked(king - 1, them) &&
      !this.isSquareAttacked(king - 2, them)
    ) {
      moves.push(encodeMove(king, king - 2, 0, 0, FLAG_CASTLE));
    }
  }

  legalMoves(): number[] {
    const legal: number[] = [];
    for (const move of this.generateMoves()) {
      if (this.makeMoveIfLegal(move)) {
        this.unmakeMove();
        legal.push(move);
      }
    }
    return legal;
  }

  /** Makes `move` and keeps it only if it does not leave our own king in check. */
  makeMoveIfLegal(move: number): boolean {
    const us = this.turn;
    this.makeMove(move);
    if (this.isSquareAttacked(this.kingSquare[us], this.turn)) {
      this.unmakeMove();
      return false;
    }
    return true;
  }

  /* ----------------------------------------------------- make / unmake --- */

  makeMove(move: number): void {
    const from = moveFrom(move);
    const to = moveTo(move);
    const flags = moveFlags(move);
    const promotion = movePromotion(move);
    const captured = moveCaptured(move);
    const us = this.turn;
    const them = (1 - us) as Color;
    const piece = this.board[from];
    const type = piece & 7;

    const ply = this.ply++;
    this.uMove[ply] = move;
    this.uCastling[ply] = this.castling;
    this.uEp[ply] = this.epSquare;
    this.uHalfmove[ply] = this.halfmoveClock;
    this.uFullmove[ply] = this.fullmoveNumber;
    this.uHashHi[ply] = this.hashHi;
    this.uHashLo[ply] = this.hashLo;

    this.xorPiece(piece, from);
    this.board[from] = 0;

    if (flags & FLAG_EP) {
      const capturedSquare = us === WHITE ? to - 16 : to + 16;
      this.xorPiece(this.board[capturedSquare], capturedSquare);
      this.board[capturedSquare] = 0;
    } else if (captured) {
      this.xorPiece(captured, to);
    }

    const placed = promotion ? promotion | (us << 3) : piece;
    this.board[to] = placed;
    this.xorPiece(placed, to);

    if (type === KING) {
      this.kingSquare[us] = to;
      if (flags & FLAG_CASTLE) {
        const rookFrom = to > from ? to + 1 : to - 2;
        const rookTo = to > from ? to - 1 : to + 1;
        const rook = this.board[rookFrom];
        this.xorPiece(rook, rookFrom);
        this.board[rookFrom] = 0;
        this.board[rookTo] = rook;
        this.xorPiece(rook, rookTo);
      }
    }

    this.hashHi ^= Z_CASTLE_HI[this.castling];
    this.hashLo ^= Z_CASTLE_LO[this.castling];
    this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
    this.hashHi ^= Z_CASTLE_HI[this.castling];
    this.hashLo ^= Z_CASTLE_LO[this.castling];

    if (this.epSquare !== -1) {
      this.hashHi ^= Z_EP_HI[fileOf(this.epSquare)];
      this.hashLo ^= Z_EP_LO[fileOf(this.epSquare)];
    }
    this.epSquare = flags & FLAG_DOUBLE ? from + (us === WHITE ? 16 : -16) : -1;
    if (this.epSquare !== -1) {
      this.hashHi ^= Z_EP_HI[fileOf(this.epSquare)];
      this.hashLo ^= Z_EP_LO[fileOf(this.epSquare)];
    }

    this.halfmoveClock = type === PAWN || captured !== 0 ? 0 : this.halfmoveClock + 1;
    if (us === BLACK) this.fullmoveNumber++;

    this.turn = them;
    this.hashHi ^= Z_SIDE_HI;
    this.hashLo ^= Z_SIDE_LO;
  }

  /**
   * Passes the turn without touching the board, for null-move pruning. Must be
   * paired with {@link unmakeNullMove}.
   */
  makeNullMove(): void {
    const ply = this.ply++;
    this.uMove[ply] = 0;
    this.uCastling[ply] = this.castling;
    this.uEp[ply] = this.epSquare;
    this.uHalfmove[ply] = this.halfmoveClock;
    this.uFullmove[ply] = this.fullmoveNumber;
    this.uHashHi[ply] = this.hashHi;
    this.uHashLo[ply] = this.hashLo;

    if (this.epSquare !== -1) {
      this.hashHi ^= Z_EP_HI[fileOf(this.epSquare)];
      this.hashLo ^= Z_EP_LO[fileOf(this.epSquare)];
      this.epSquare = -1;
    }
    this.halfmoveClock++;
    if (this.turn === BLACK) this.fullmoveNumber++;
    this.turn = (1 - this.turn) as Color;
    this.hashHi ^= Z_SIDE_HI;
    this.hashLo ^= Z_SIDE_LO;
  }

  unmakeNullMove(): void {
    const ply = --this.ply;
    this.castling = this.uCastling[ply];
    this.epSquare = this.uEp[ply];
    this.halfmoveClock = this.uHalfmove[ply];
    this.fullmoveNumber = this.uFullmove[ply];
    this.hashHi = this.uHashHi[ply];
    this.hashLo = this.uHashLo[ply];
    this.turn = (1 - this.turn) as Color;
  }

  /** True when the side to move has a piece other than pawns and the king. */
  hasNonPawnMaterial(): boolean {
    for (let square = 0; square < 128; square++) {
      if (square & 0x88) continue;
      const piece = this.board[square];
      if (!piece || ((piece >> 3) & 1) !== this.turn) continue;
      const type = piece & 7;
      if (type !== PAWN && type !== KING) return true;
    }
    return false;
  }

  unmakeMove(): void {
    const ply = --this.ply;
    const move = this.uMove[ply];
    const from = moveFrom(move);
    const to = moveTo(move);
    const flags = moveFlags(move);
    const promotion = movePromotion(move);
    const captured = moveCaptured(move);

    this.castling = this.uCastling[ply];
    this.epSquare = this.uEp[ply];
    this.halfmoveClock = this.uHalfmove[ply];
    this.fullmoveNumber = this.uFullmove[ply];
    this.hashHi = this.uHashHi[ply];
    this.hashLo = this.uHashLo[ply];
    this.turn = (1 - this.turn) as Color;

    const us = this.turn;
    const moved = promotion ? PAWN | (us << 3) : this.board[to];
    this.board[from] = moved;
    this.board[to] = 0;

    if (flags & FLAG_EP) {
      const capturedSquare = us === WHITE ? to - 16 : to + 16;
      this.board[capturedSquare] = captured;
    } else if (captured) {
      this.board[to] = captured;
    }

    if ((moved & 7) === KING) {
      this.kingSquare[us] = from;
      if (flags & FLAG_CASTLE) {
        const rookFrom = to > from ? to + 1 : to - 2;
        const rookTo = to > from ? to - 1 : to + 1;
        this.board[rookFrom] = this.board[rookTo];
        this.board[rookTo] = 0;
      }
    }
  }
}
