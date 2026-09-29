import {
  BISHOP_DIRS,
  KING_TARGETS,
  KNIGHT_TARGETS,
  PAWN_ATTACKERS,
  RAYS,
  ROOK_DIRS,
} from './attacks';
import {
  BISHOP,
  BLACK,
  CASTLE_BK,
  CASTLE_BQ,
  CASTLE_WK,
  CASTLE_WQ,
  type Color,
  EMPTY,
  FLAG_CASTLE,
  FLAG_DOUBLE_PUSH,
  FLAG_EN_PASSANT,
  KING,
  KNIGHT,
  type Move,
  PAWN,
  QUEEN,
  ROOK,
  WHITE,
  makePiece,
  makeSquare,
  moveFlags,
  moveFrom,
  movePromotion,
  moveTo,
  parseSquare,
  pieceColor,
  pieceKind,
  squareFile,
  squareName,
  squareRank,
} from './types';
import {
  CASTLE_KEYS_HI,
  CASTLE_KEYS_LO,
  EP_KEYS_HI,
  EP_KEYS_LO,
  PIECE_KEYS_HI,
  PIECE_KEYS_LO,
  SIDE_KEY_HI,
  SIDE_KEY_LO,
} from './zobrist';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const MAX_PLY = 2048;
const NO_SQUARE = -1;

const A1 = 0, E1 = 4, H1 = 7, A8 = 56, E8 = 60, H8 = 63;

/** Castling rights that survive a move touching each square. */
const CASTLE_MASK = new Uint8Array(64).fill(15);
CASTLE_MASK[A1] = 15 & ~CASTLE_WQ;
CASTLE_MASK[E1] = 15 & ~(CASTLE_WK | CASTLE_WQ);
CASTLE_MASK[H1] = 15 & ~CASTLE_WK;
CASTLE_MASK[A8] = 15 & ~CASTLE_BQ;
CASTLE_MASK[E8] = 15 & ~(CASTLE_BK | CASTLE_BQ);
CASTLE_MASK[H8] = 15 & ~CASTLE_BK;

const FEN_PIECES = 'pnbrqk';

/** Mutable board state with make/unmake and incremental Zobrist hashing. */
export class Position {
  readonly board = new Int8Array(64);
  turn: Color = WHITE;
  castling = 0;
  epSquare = NO_SQUARE;
  halfmoveClock = 0;
  fullmoveNumber = 1;
  readonly kingSquare: [number, number] = [NO_SQUARE, NO_SQUARE];
  hashLo = 0;
  hashHi = 0;
  ply = 0;

  private readonly undoMove = new Int32Array(MAX_PLY);
  private readonly undoCaptured = new Int8Array(MAX_PLY);
  private readonly undoCastling = new Uint8Array(MAX_PLY);
  private readonly undoEp = new Int8Array(MAX_PLY);
  private readonly undoHalfmove = new Int16Array(MAX_PLY);
  private readonly undoHashLo = new Int32Array(MAX_PLY);
  private readonly undoHashHi = new Int32Array(MAX_PLY);

  static startPosition(): Position {
    return Position.fromFen(START_FEN);
  }

  static fromFen(fen: string): Position {
    const pos = new Position();
    const [placement, side, castle, ep, half, full] = fen.trim().split(/\s+/);
    if (!placement || !side) throw new Error(`Invalid FEN: ${fen}`);

    const rows = placement.split('/');
    if (rows.length !== 8) throw new Error(`Invalid FEN placement: ${placement}`);
    rows.forEach((row, index) => {
      const rank = 7 - index;
      let file = 0;
      for (const ch of row) {
        if (ch >= '1' && ch <= '8') {
          file += Number(ch);
          continue;
        }
        const kind = FEN_PIECES.indexOf(ch.toLowerCase()) + 1;
        if (kind === 0 || file > 7) throw new Error(`Invalid FEN placement: ${placement}`);
        const color: Color = ch === ch.toUpperCase() ? WHITE : BLACK;
        const sq = makeSquare(file, rank);
        pos.board[sq] = makePiece(kind, color);
        if (kind === KING) pos.kingSquare[color] = sq;
        file++;
      }
      if (file !== 8) throw new Error(`Invalid FEN rank: ${row}`);
    });

    pos.turn = side === 'b' ? BLACK : WHITE;
    if (castle && castle !== '-') {
      if (castle.includes('K')) pos.castling |= CASTLE_WK;
      if (castle.includes('Q')) pos.castling |= CASTLE_WQ;
      if (castle.includes('k')) pos.castling |= CASTLE_BK;
      if (castle.includes('q')) pos.castling |= CASTLE_BQ;
    }
    pos.epSquare = ep && ep !== '-' ? parseSquare(ep) : NO_SQUARE;
    pos.halfmoveClock = half ? Number(half) : 0;
    pos.fullmoveNumber = full ? Number(full) : 1;
    if (pos.kingSquare[WHITE] < 0 || pos.kingSquare[BLACK] < 0) {
      throw new Error('Invalid FEN: both kings are required');
    }
    pos.computeHash();
    return pos;
  }

  toFen(): string {
    const rows: string[] = [];
    for (let rank = 7; rank >= 0; rank--) {
      let row = '';
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const piece = this.board[makeSquare(file, rank)];
        if (piece === EMPTY) {
          empty++;
          continue;
        }
        if (empty) row += empty;
        empty = 0;
        const letter = FEN_PIECES[pieceKind(piece) - 1];
        row += pieceColor(piece) === WHITE ? letter.toUpperCase() : letter;
      }
      if (empty) row += empty;
      rows.push(row);
    }
    let castle = '';
    if (this.castling & CASTLE_WK) castle += 'K';
    if (this.castling & CASTLE_WQ) castle += 'Q';
    if (this.castling & CASTLE_BK) castle += 'k';
    if (this.castling & CASTLE_BQ) castle += 'q';
    const ep = this.epSquare === NO_SQUARE ? '-' : squareName(this.epSquare);
    return `${rows.join('/')} ${this.turn === WHITE ? 'w' : 'b'} ${castle || '-'} ${ep} ${this.halfmoveClock} ${this.fullmoveNumber}`;
  }

  /** Attack test: is `sq` attacked by any piece of `by`? */
  isAttacked(sq: number, by: Color): boolean {
    const board = this.board;
    const color = by << 3;

    for (const from of PAWN_ATTACKERS[by][sq]) {
      if (board[from] === (PAWN | color)) return true;
    }
    for (const from of KNIGHT_TARGETS[sq]) {
      if (board[from] === (KNIGHT | color)) return true;
    }
    for (const from of KING_TARGETS[sq]) {
      if (board[from] === (KING | color)) return true;
    }
    const rays = RAYS[sq];
    for (const dir of ROOK_DIRS) {
      for (const from of rays[dir]) {
        const piece = board[from];
        if (piece === EMPTY) continue;
        if (piece === (ROOK | color) || piece === (QUEEN | color)) return true;
        break;
      }
    }
    for (const dir of BISHOP_DIRS) {
      for (const from of rays[dir]) {
        const piece = board[from];
        if (piece === EMPTY) continue;
        if (piece === (BISHOP | color) || piece === (QUEEN | color)) return true;
        break;
      }
    }
    return false;
  }

  inCheck(color: Color = this.turn): boolean {
    return this.isAttacked(this.kingSquare[color], (color ^ 1) as Color);
  }

  /** True only if an enemy pawn could actually capture en passant, per FIDE repetition rules. */
  private epKeyIndex(): number {
    if (this.epSquare === NO_SQUARE) return -1;
    const attackers = PAWN_ATTACKERS[this.turn ^ 1][this.epSquare];
    const pawn = makePiece(PAWN, this.turn);
    for (const from of attackers) {
      if (this.board[from] === pawn) return squareFile(this.epSquare);
    }
    return -1;
  }

  private computeHash(): void {
    let lo = 0;
    let hi = 0;
    for (let sq = 0; sq < 64; sq++) {
      const piece = this.board[sq];
      if (piece !== EMPTY) {
        lo ^= PIECE_KEYS_LO[piece * 64 + sq];
        hi ^= PIECE_KEYS_HI[piece * 64 + sq];
      }
    }
    lo ^= CASTLE_KEYS_LO[this.castling];
    hi ^= CASTLE_KEYS_HI[this.castling];
    if (this.turn === BLACK) {
      lo ^= SIDE_KEY_LO;
      hi ^= SIDE_KEY_HI;
    }
    const ep = this.epKeyIndex();
    if (ep >= 0) {
      lo ^= EP_KEYS_LO[ep];
      hi ^= EP_KEYS_HI[ep];
    }
    this.hashLo = lo;
    this.hashHi = hi;
  }

  private xorPiece(piece: number, sq: number): void {
    this.hashLo ^= PIECE_KEYS_LO[piece * 64 + sq];
    this.hashHi ^= PIECE_KEYS_HI[piece * 64 + sq];
  }

  private xorEp(): void {
    const ep = this.epKeyIndex();
    if (ep >= 0) {
      this.hashLo ^= EP_KEYS_LO[ep];
      this.hashHi ^= EP_KEYS_HI[ep];
    }
  }

  private saveUndo(move: Move, captured: number): void {
    const i = this.ply;
    this.undoMove[i] = move;
    this.undoCaptured[i] = captured;
    this.undoCastling[i] = this.castling;
    this.undoEp[i] = this.epSquare;
    this.undoHalfmove[i] = this.halfmoveClock;
    this.undoHashLo[i] = this.hashLo;
    this.undoHashHi[i] = this.hashHi;
  }

  makeMove(move: Move): void {
    const board = this.board;
    const from = moveFrom(move);
    const to = moveTo(move);
    const flags = moveFlags(move);
    const promotion = movePromotion(move);
    const us = this.turn;
    const piece = board[from];
    const kind = pieceKind(piece);

    const isEp = (flags & FLAG_EN_PASSANT) !== 0;
    const captureSq = isEp ? (us === WHITE ? to - 8 : to + 8) : to;
    const captured = board[captureSq];

    this.saveUndo(move, captured);
    this.ply++;

    this.xorEp();
    this.hashLo ^= CASTLE_KEYS_LO[this.castling];
    this.hashHi ^= CASTLE_KEYS_HI[this.castling];

    if (captured !== EMPTY) {
      this.xorPiece(captured, captureSq);
      board[captureSq] = EMPTY;
    }

    this.xorPiece(piece, from);
    board[from] = EMPTY;
    const placed = promotion ? makePiece(promotion, us) : piece;
    board[to] = placed;
    this.xorPiece(placed, to);

    if (kind === KING) this.kingSquare[us] = to;

    if (flags & FLAG_CASTLE) {
      const kingSide = to > from;
      const rookFrom = kingSide ? from + 3 : from - 4;
      const rookTo = kingSide ? from + 1 : from - 1;
      const rook = board[rookFrom];
      this.xorPiece(rook, rookFrom);
      this.xorPiece(rook, rookTo);
      board[rookFrom] = EMPTY;
      board[rookTo] = rook;
    }

    this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
    this.hashLo ^= CASTLE_KEYS_LO[this.castling];
    this.hashHi ^= CASTLE_KEYS_HI[this.castling];

    this.epSquare = flags & FLAG_DOUBLE_PUSH ? (from + to) >> 1 : NO_SQUARE;

    this.halfmoveClock = kind === PAWN || captured !== EMPTY ? 0 : this.halfmoveClock + 1;
    if (us === BLACK) this.fullmoveNumber++;
    this.turn = (us ^ 1) as Color;
    this.hashLo ^= SIDE_KEY_LO;
    this.hashHi ^= SIDE_KEY_HI;
    this.xorEp();
  }

  unmakeMove(): void {
    this.ply--;
    const i = this.ply;
    const move = this.undoMove[i];
    const captured = this.undoCaptured[i];
    const from = moveFrom(move);
    const to = moveTo(move);
    const flags = moveFlags(move);
    const us = (this.turn ^ 1) as Color;
    const board = this.board;

    this.turn = us;
    if (us === BLACK) this.fullmoveNumber--;

    const moved = board[to];
    const original = movePromotion(move) ? makePiece(PAWN, us) : moved;
    board[from] = original;
    board[to] = EMPTY;
    if (pieceKind(original) === KING) this.kingSquare[us] = from;

    if (captured !== EMPTY) {
      const captureSq = flags & FLAG_EN_PASSANT ? (us === WHITE ? to - 8 : to + 8) : to;
      board[captureSq] = captured;
    }

    if (flags & FLAG_CASTLE) {
      const kingSide = to > from;
      const rookFrom = kingSide ? from + 3 : from - 4;
      const rookTo = kingSide ? from + 1 : from - 1;
      board[rookFrom] = board[rookTo];
      board[rookTo] = EMPTY;
    }

    this.castling = this.undoCastling[i];
    this.epSquare = this.undoEp[i];
    this.halfmoveClock = this.undoHalfmove[i];
    this.hashLo = this.undoHashLo[i];
    this.hashHi = this.undoHashHi[i];
  }

  /** Pass the turn (used by null-move pruning). Pair with {@link unmakeNullMove}. */
  makeNullMove(): void {
    this.saveUndo(0, EMPTY);
    this.ply++;
    this.xorEp();
    this.epSquare = NO_SQUARE;
    this.turn = (this.turn ^ 1) as Color;
    this.hashLo ^= SIDE_KEY_LO;
    this.hashHi ^= SIDE_KEY_HI;
    this.halfmoveClock++;
  }

  unmakeNullMove(): void {
    this.ply--;
    const i = this.ply;
    this.turn = (this.turn ^ 1) as Color;
    this.epSquare = this.undoEp[i];
    this.halfmoveClock = this.undoHalfmove[i];
    this.hashLo = this.undoHashLo[i];
    this.hashHi = this.undoHashHi[i];
  }

  /**
   * How many times the current position has occurred, including now.
   * Only positions since the last irreversible move can repeat.
   */
  repetitionCount(): number {
    let count = 1;
    const limit = Math.min(this.halfmoveClock, this.ply);
    for (let back = 2; back <= limit; back += 2) {
      const index = this.ply - back;
      if (this.undoHashLo[index] === this.hashLo && this.undoHashHi[index] === this.hashHi) count++;
    }
    return count;
  }

  /** K vs K, K+minor vs K, or kings with only same-colored bishops. */
  isInsufficientMaterial(): boolean {
    const minors: number[] = [];
    for (let sq = 0; sq < 64; sq++) {
      const kind = pieceKind(this.board[sq]);
      if (kind === PAWN || kind === ROOK || kind === QUEEN) return false;
      if (kind === KNIGHT || kind === BISHOP) minors.push(sq);
    }
    if (minors.length <= 1) return true;
    const allBishops = minors.every((sq) => pieceKind(this.board[sq]) === BISHOP);
    if (!allBishops) return false;
    const shade = (sq: number): number => (squareFile(sq) + squareRank(sq)) & 1;
    return minors.every((sq) => shade(sq) === shade(minors[0]));
  }

  /** Whether `color` has any piece besides pawns and king (guards null-move zugzwang). */
  hasNonPawnMaterial(color: Color): boolean {
    for (let sq = 0; sq < 64; sq++) {
      const piece = this.board[sq];
      if (piece === EMPTY || pieceColor(piece) !== color) continue;
      const kind = pieceKind(piece);
      if (kind !== PAWN && kind !== KING) return true;
    }
    return false;
  }
}
