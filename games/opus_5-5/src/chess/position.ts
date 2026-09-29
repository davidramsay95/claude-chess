import {
  BISHOP,
  BLACK,
  type Color,
  encodeMove,
  FLAG_CAPTURE,
  FLAG_CASTLE,
  FLAG_DOUBLE_PUSH,
  FLAG_EN_PASSANT,
  KING,
  KNIGHT,
  type Move,
  moveFlags,
  moveFrom,
  movePromotion,
  moveTo,
  moveToUci,
  NO_MOVE,
  PAWN,
  parseSquare,
  QUEEN,
  ROOK,
  squareName,
  WHITE,
} from "./move";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const CASTLE_WHITE_KING = 1;
export const CASTLE_WHITE_QUEEN = 2;
export const CASTLE_BLACK_KING = 4;
export const CASTLE_BLACK_QUEEN = 8;

/** Pieces are `color << 3 | type`, so white pieces are 1-6 and black pieces 9-14. */
export const makePiece = (color: Color, type: number): number => (color << 3) | type;
export const pieceType = (piece: number): number => piece & 7;
export const pieceColor = (piece: number): Color => (piece >> 3) as Color;

const KNIGHT_OFFSETS = [33, 31, 18, 14, -14, -18, -31, -33];
const KING_OFFSETS = [1, -1, 16, -16, 15, 17, -15, -17];
const DIAGONAL_DIRECTIONS = [15, 17, -15, -17];
const ORTHOGONAL_DIRECTIONS = [1, -1, 16, -16];
const PROMOTION_TYPES = [QUEEN, ROOK, BISHOP, KNIGHT];

/** The 64 playable 0x88 indices in a1..h8 order. */
export const BOARD_SQUARES: readonly number[] = Array.from({ length: 64 }, (_, i) => (i >> 3) * 16 + (i & 7));

const onBoard = (square: number): boolean => (square & 0x88) === 0;

/** Castling rights survive a move only if neither the from nor to square is a king or rook home square. */
const CASTLE_MASK = (() => {
  const mask = new Uint8Array(128).fill(15);
  mask[0] = 15 & ~CASTLE_WHITE_QUEEN;
  mask[4] = 15 & ~(CASTLE_WHITE_KING | CASTLE_WHITE_QUEEN);
  mask[7] = 15 & ~CASTLE_WHITE_KING;
  mask[112] = 15 & ~CASTLE_BLACK_QUEEN;
  mask[116] = 15 & ~(CASTLE_BLACK_KING | CASTLE_BLACK_QUEEN);
  mask[119] = 15 & ~CASTLE_BLACK_KING;
  return mask;
})();

/** Deterministic PRNG so hash keys are stable across runs and workers. */
const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state | 0;
  };
};

const random = createRandom(0x9e3779b9);
const fillRandom = (length: number): Int32Array => Int32Array.from({ length }, random);
// Two independent 32-bit keys give a 64-bit hash without BigInt overhead.
const PIECE_KEYS_LO = fillRandom(16 * 128);
const PIECE_KEYS_HI = fillRandom(16 * 128);
const CASTLE_KEYS_LO = fillRandom(16);
const CASTLE_KEYS_HI = fillRandom(16);
const EP_KEYS_LO = fillRandom(8);
const EP_KEYS_HI = fillRandom(8);
const SIDE_KEY_LO = random();
const SIDE_KEY_HI = random();

const PIECE_CHARS = " PNBRQK  pnbrqk";

/**
 * Mutable chess position with incremental make/unmake, designed for both the UI rules layer and the search.
 */
export class Position {
  readonly board = new Int8Array(128);
  turn: Color = WHITE;
  castling = 0;
  /** En passant target square, only set when an enemy pawn could actually capture there. */
  epSquare = -1;
  halfmoveClock = 0;
  fullmoveNumber = 1;
  hashLo = 0;
  hashHi = 0;
  private readonly kings = [0, 0];

  private readonly undoMoves: Move[] = [];
  private readonly undoCaptured: number[] = [];
  private readonly undoCastling: number[] = [];
  private readonly undoEp: number[] = [];
  private readonly undoHalfmove: number[] = [];
  private readonly undoHashLo: number[] = [];
  private readonly undoHashHi: number[] = [];

  /** Parses a FEN string. Throws on malformed input. */
  static fromFen(fen: string): Position {
    const fields = fen.trim().split(/\s+/);
    if (fields.length < 4 || fields.length > 6) throw new Error(`Invalid FEN: expected 4-6 fields in "${fen}"`);
    const [placement, side, castling, ep, halfmove = "0", fullmove = "1"] = fields;
    const position = new Position();

    const ranks = placement.split("/");
    if (ranks.length !== 8) throw new Error(`Invalid FEN: expected 8 ranks in "${fen}"`);
    const kingCounts = [0, 0];
    ranks.forEach((rankText, index) => {
      const rank = 7 - index;
      let file = 0;
      for (const char of rankText) {
        if (/[1-8]/.test(char)) {
          file += Number(char);
          continue;
        }
        const pieceIndex = PIECE_CHARS.indexOf(char);
        if (pieceIndex <= 0 || char === " " || file > 7) throw new Error(`Invalid FEN: bad piece "${char}" in "${fen}"`);
        const square = rank * 16 + file;
        position.board[square] = pieceIndex;
        if (pieceType(pieceIndex) === KING) {
          position.kings[pieceColor(pieceIndex)] = square;
          kingCounts[pieceColor(pieceIndex)] += 1;
        }
        file += 1;
      }
      if (file !== 8) throw new Error(`Invalid FEN: rank ${rank + 1} does not have 8 files in "${fen}"`);
    });
    if (kingCounts[WHITE] !== 1 || kingCounts[BLACK] !== 1) throw new Error(`Invalid FEN: each side needs one king in "${fen}"`);

    if (side !== "w" && side !== "b") throw new Error(`Invalid FEN: bad side to move in "${fen}"`);
    position.turn = side === "w" ? WHITE : BLACK;

    if (!/^(-|K?Q?k?q?)$/.test(castling) || castling === "") throw new Error(`Invalid FEN: bad castling field in "${fen}"`);
    if (castling.includes("K")) position.castling |= CASTLE_WHITE_KING;
    if (castling.includes("Q")) position.castling |= CASTLE_WHITE_QUEEN;
    if (castling.includes("k")) position.castling |= CASTLE_BLACK_KING;
    if (castling.includes("q")) position.castling |= CASTLE_BLACK_QUEEN;
    position.dropImpossibleCastlingRights();

    if (ep !== "-") {
      const square = parseSquare(ep);
      if (square < 0) throw new Error(`Invalid FEN: bad en passant square in "${fen}"`);
      if (position.canCaptureEnPassant(square, position.turn)) position.epSquare = square;
    }

    position.halfmoveClock = Number(halfmove);
    position.fullmoveNumber = Number(fullmove);
    if (!Number.isInteger(position.halfmoveClock) || !Number.isInteger(position.fullmoveNumber)) {
      throw new Error(`Invalid FEN: bad move counters in "${fen}"`);
    }
    position.computeHash();
    return position;
  }

  /** Serialises the position to FEN. */
  toFen(): string {
    const rows: string[] = [];
    for (let rank = 7; rank >= 0; rank--) {
      let row = "";
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const piece = this.board[rank * 16 + file];
        if (piece === 0) {
          empty += 1;
          continue;
        }
        if (empty > 0) row += empty;
        empty = 0;
        row += PIECE_CHARS[piece];
      }
      if (empty > 0) row += empty;
      rows.push(row);
    }
    let castling = "";
    if (this.castling & CASTLE_WHITE_KING) castling += "K";
    if (this.castling & CASTLE_WHITE_QUEEN) castling += "Q";
    if (this.castling & CASTLE_BLACK_KING) castling += "k";
    if (this.castling & CASTLE_BLACK_QUEEN) castling += "q";
    const ep = this.epSquare === -1 ? "-" : squareName(this.epSquare);
    return `${rows.join("/")} ${this.turn === WHITE ? "w" : "b"} ${castling || "-"} ${ep} ${this.halfmoveClock} ${this.fullmoveNumber}`;
  }

  clone(): Position {
    const copy = Position.fromFen(this.toFen());
    copy.undoMoves.push(...this.undoMoves);
    copy.undoCaptured.push(...this.undoCaptured);
    copy.undoCastling.push(...this.undoCastling);
    copy.undoEp.push(...this.undoEp);
    copy.undoHalfmove.push(...this.undoHalfmove);
    copy.undoHashLo.push(...this.undoHashLo);
    copy.undoHashHi.push(...this.undoHashHi);
    return copy;
  }

  pieceAt(square: number): number {
    return this.board[square];
  }

  kingSquare(color: Color): number {
    return this.kings[color];
  }

  /** 53-bit hash of the position, safe to compare as a plain number. */
  hashKey(): number {
    return (this.hashHi & 0x1fffff) * 4294967296 + (this.hashLo >>> 0);
  }

  /** Number of moves made since this position was created (the undo stack depth). */
  ply(): number {
    return this.undoMoves.length;
  }

  inCheck(): boolean {
    return this.isSquareAttacked(this.kings[this.turn], (this.turn ^ 1) as Color);
  }

  /** True when the side that just moved left its own king attacked, i.e. the last move was illegal. */
  lastMoveLeftKingInCheck(): boolean {
    return this.isSquareAttacked(this.kings[this.turn ^ 1], this.turn);
  }

  isSquareAttacked(square: number, by: Color): boolean {
    const board = this.board;
    const pawn = makePiece(by, PAWN);
    const pawnSources = by === WHITE ? [square - 15, square - 17] : [square + 15, square + 17];
    for (const source of pawnSources) {
      if (onBoard(source) && board[source] === pawn) return true;
    }
    const knight = makePiece(by, KNIGHT);
    for (const offset of KNIGHT_OFFSETS) {
      const source = square + offset;
      if (onBoard(source) && board[source] === knight) return true;
    }
    const king = makePiece(by, KING);
    for (const offset of KING_OFFSETS) {
      const source = square + offset;
      if (onBoard(source) && board[source] === king) return true;
    }
    const bishop = makePiece(by, BISHOP);
    const rook = makePiece(by, ROOK);
    const queen = makePiece(by, QUEEN);
    for (const direction of DIAGONAL_DIRECTIONS) {
      for (let source = square + direction; onBoard(source); source += direction) {
        const piece = board[source];
        if (piece === 0) continue;
        if (piece === bishop || piece === queen) return true;
        break;
      }
    }
    for (const direction of ORTHOGONAL_DIRECTIONS) {
      for (let source = square + direction; onBoard(source); source += direction) {
        const piece = board[source];
        if (piece === 0) continue;
        if (piece === rook || piece === queen) return true;
        break;
      }
    }
    return false;
  }

  /**
   * Appends pseudo-legal moves (may leave the king in check) to `moves`.
   * With `capturesOnly`, emits captures and promotions only, for quiescence search.
   */
  generatePseudoMoves(moves: Move[], capturesOnly = false): Move[] {
    const board = this.board;
    const us = this.turn;
    const them = (us ^ 1) as Color;
    for (const from of BOARD_SQUARES) {
      const piece = board[from];
      if (piece === 0 || pieceColor(piece) !== us) continue;
      switch (pieceType(piece)) {
        case PAWN:
          this.generatePawnMoves(moves, from, capturesOnly);
          break;
        case KNIGHT:
          this.generateStepMoves(moves, from, KNIGHT_OFFSETS, them, capturesOnly);
          break;
        case BISHOP:
          this.generateSlideMoves(moves, from, DIAGONAL_DIRECTIONS, them, capturesOnly);
          break;
        case ROOK:
          this.generateSlideMoves(moves, from, ORTHOGONAL_DIRECTIONS, them, capturesOnly);
          break;
        case QUEEN:
          this.generateSlideMoves(moves, from, DIAGONAL_DIRECTIONS, them, capturesOnly);
          this.generateSlideMoves(moves, from, ORTHOGONAL_DIRECTIONS, them, capturesOnly);
          break;
        case KING:
          this.generateStepMoves(moves, from, KING_OFFSETS, them, capturesOnly);
          if (!capturesOnly) this.generateCastlingMoves(moves, from, us);
          break;
      }
    }
    return moves;
  }

  generateLegalMoves(): Move[] {
    const legal: Move[] = [];
    for (const move of this.generatePseudoMoves([])) {
      this.makeMove(move);
      if (!this.lastMoveLeftKingInCheck()) legal.push(move);
      this.unmakeMove();
    }
    return legal;
  }

  /** Resolves a UCI string to a legal move, or NO_MOVE when it is not legal here. */
  parseUci(uci: string): Move {
    return this.generateLegalMoves().find((move) => moveToUci(move) === uci) ?? NO_MOVE;
  }

  /** Plays a pseudo-legal move. Callers must check legality with `lastMoveLeftKingInCheck`. */
  makeMove(move: Move): void {
    const board = this.board;
    const from = moveFrom(move);
    const to = moveTo(move);
    const promotion = movePromotion(move);
    const flags = moveFlags(move);
    const us = this.turn;
    const them = (us ^ 1) as Color;
    const piece = board[from];

    this.undoMoves.push(move);
    this.undoCastling.push(this.castling);
    this.undoEp.push(this.epSquare);
    this.undoHalfmove.push(this.halfmoveClock);
    this.undoHashLo.push(this.hashLo);
    this.undoHashHi.push(this.hashHi);

    let hashLo = this.hashLo ^ CASTLE_KEYS_LO[this.castling];
    let hashHi = this.hashHi ^ CASTLE_KEYS_HI[this.castling];
    if (this.epSquare !== -1) {
      hashLo ^= EP_KEYS_LO[this.epSquare & 7];
      hashHi ^= EP_KEYS_HI[this.epSquare & 7];
    }

    hashLo ^= PIECE_KEYS_LO[piece * 128 + from];
    hashHi ^= PIECE_KEYS_HI[piece * 128 + from];
    board[from] = 0;

    let captured = board[to];
    if (flags & FLAG_EN_PASSANT) {
      const capturedSquare = to + (us === WHITE ? -16 : 16);
      captured = board[capturedSquare];
      board[capturedSquare] = 0;
      hashLo ^= PIECE_KEYS_LO[captured * 128 + capturedSquare];
      hashHi ^= PIECE_KEYS_HI[captured * 128 + capturedSquare];
    } else if (captured !== 0) {
      hashLo ^= PIECE_KEYS_LO[captured * 128 + to];
      hashHi ^= PIECE_KEYS_HI[captured * 128 + to];
    }
    this.undoCaptured.push(captured);

    const placed = promotion ? makePiece(us, promotion) : piece;
    board[to] = placed;
    hashLo ^= PIECE_KEYS_LO[placed * 128 + to];
    hashHi ^= PIECE_KEYS_HI[placed * 128 + to];

    if (flags & FLAG_CASTLE) {
      const [rookFrom, rookTo] = to > from ? [from + 3, from + 1] : [from - 4, from - 1];
      const rook = board[rookFrom];
      board[rookFrom] = 0;
      board[rookTo] = rook;
      hashLo ^= PIECE_KEYS_LO[rook * 128 + rookFrom] ^ PIECE_KEYS_LO[rook * 128 + rookTo];
      hashHi ^= PIECE_KEYS_HI[rook * 128 + rookFrom] ^ PIECE_KEYS_HI[rook * 128 + rookTo];
    }
    if (pieceType(piece) === KING) this.kings[us] = to;

    this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
    hashLo ^= CASTLE_KEYS_LO[this.castling];
    hashHi ^= CASTLE_KEYS_HI[this.castling];

    this.epSquare = -1;
    if (flags & FLAG_DOUBLE_PUSH) {
      const passed = (from + to) >> 1;
      if (this.canCaptureEnPassant(passed, them)) {
        this.epSquare = passed;
        hashLo ^= EP_KEYS_LO[passed & 7];
        hashHi ^= EP_KEYS_HI[passed & 7];
      }
    }

    this.halfmoveClock = pieceType(piece) === PAWN || captured !== 0 ? 0 : this.halfmoveClock + 1;
    if (us === BLACK) this.fullmoveNumber += 1;
    this.turn = them;
    this.hashLo = hashLo ^ SIDE_KEY_LO;
    this.hashHi = hashHi ^ SIDE_KEY_HI;
  }

  unmakeMove(): void {
    const move = this.undoMoves.pop();
    if (move === undefined) throw new Error("unmakeMove called with no move to undo");
    const captured = this.undoCaptured.pop() ?? 0;
    this.castling = this.undoCastling.pop() ?? 0;
    this.epSquare = this.undoEp.pop() ?? -1;
    this.halfmoveClock = this.undoHalfmove.pop() ?? 0;
    this.hashLo = this.undoHashLo.pop() ?? 0;
    this.hashHi = this.undoHashHi.pop() ?? 0;
    this.turn = (this.turn ^ 1) as Color;
    const us = this.turn;
    if (us === BLACK) this.fullmoveNumber -= 1;
    if (move === NO_MOVE) return;

    const board = this.board;
    const from = moveFrom(move);
    const to = moveTo(move);
    const flags = moveFlags(move);
    const placed = board[to];
    board[from] = movePromotion(move) ? makePiece(us, PAWN) : placed;
    if (flags & FLAG_EN_PASSANT) {
      board[to] = 0;
      board[to + (us === WHITE ? -16 : 16)] = captured;
    } else {
      board[to] = captured;
    }
    if (flags & FLAG_CASTLE) {
      const [rookFrom, rookTo] = to > from ? [from + 3, from + 1] : [from - 4, from - 1];
      board[rookFrom] = board[rookTo];
      board[rookTo] = 0;
    }
    if (pieceType(placed) === KING) this.kings[us] = from;
  }

  /** Passes the turn without moving, for null-move pruning. Never call while in check. */
  makeNullMove(): void {
    this.undoMoves.push(NO_MOVE);
    this.undoCaptured.push(0);
    this.undoCastling.push(this.castling);
    this.undoEp.push(this.epSquare);
    this.undoHalfmove.push(this.halfmoveClock);
    this.undoHashLo.push(this.hashLo);
    this.undoHashHi.push(this.hashHi);
    if (this.epSquare !== -1) {
      this.hashLo ^= EP_KEYS_LO[this.epSquare & 7];
      this.hashHi ^= EP_KEYS_HI[this.epSquare & 7];
      this.epSquare = -1;
    }
    // Resetting the clock stops repetition detection from looking back across the null move.
    this.halfmoveClock = 0;
    if (this.turn === BLACK) this.fullmoveNumber += 1;
    this.turn = (this.turn ^ 1) as Color;
    this.hashLo ^= SIDE_KEY_LO;
    this.hashHi ^= SIDE_KEY_HI;
  }

  unmakeNullMove(): void {
    this.unmakeMove();
  }

  /** How many times the current position has occurred, counting the current occurrence. */
  repetitionCount(): number {
    let count = 1;
    const length = this.undoHashLo.length;
    const limit = Math.max(0, length - this.halfmoveClock);
    for (let index = length - 2; index >= limit; index -= 2) {
      if (this.undoHashLo[index] === this.hashLo && this.undoHashHi[index] === this.hashHi) count += 1;
    }
    return count;
  }

  /** True when neither side can possibly deliver checkmate. */
  isInsufficientMaterial(): boolean {
    let minorCount = 0;
    let knightCount = 0;
    const bishopSquareColors = new Set<number>();
    for (const square of BOARD_SQUARES) {
      const type = pieceType(this.board[square]);
      if (type === PAWN || type === ROOK || type === QUEEN) return false;
      if (type === KNIGHT) {
        minorCount += 1;
        knightCount += 1;
      }
      if (type === BISHOP) {
        minorCount += 1;
        bishopSquareColors.add(((square >> 4) + (square & 7)) & 1);
      }
    }
    if (minorCount <= 1) return true;
    return knightCount === 0 && bishopSquareColors.size === 1;
  }

  private generatePawnMoves(moves: Move[], from: number, capturesOnly: boolean): void {
    const board = this.board;
    const us = this.turn;
    const forward = us === WHITE ? 16 : -16;
    const rank = from >> 4;
    const promotes = rank === (us === WHITE ? 6 : 1);
    const one = from + forward;
    if (board[one] === 0) {
      if (promotes) {
        this.addPromotions(moves, from, one, 0, capturesOnly);
      } else if (!capturesOnly) {
        moves.push(encodeMove(from, one));
        const two = one + forward;
        if (rank === (us === WHITE ? 1 : 6) && board[two] === 0) moves.push(encodeMove(from, two, 0, FLAG_DOUBLE_PUSH));
      }
    }
    for (const target of [one - 1, one + 1]) {
      if (!onBoard(target)) continue;
      const victim = board[target];
      if (victim !== 0 && pieceColor(victim) !== us) {
        if (promotes) this.addPromotions(moves, from, target, FLAG_CAPTURE, false);
        else moves.push(encodeMove(from, target, 0, FLAG_CAPTURE));
      } else if (target === this.epSquare) {
        moves.push(encodeMove(from, target, 0, FLAG_CAPTURE | FLAG_EN_PASSANT));
      }
    }
  }

  /** In captures-only mode, quiet promotions are limited to the queen; underpromotion rarely matters there. */
  private addPromotions(moves: Move[], from: number, to: number, flags: number, queenOnly: boolean): void {
    for (const type of queenOnly ? [QUEEN] : PROMOTION_TYPES) moves.push(encodeMove(from, to, type, flags));
  }

  private generateStepMoves(moves: Move[], from: number, offsets: number[], them: Color, capturesOnly: boolean): void {
    for (const offset of offsets) {
      const to = from + offset;
      if (!onBoard(to)) continue;
      const target = this.board[to];
      if (target === 0) {
        if (!capturesOnly) moves.push(encodeMove(from, to));
      } else if (pieceColor(target) === them) {
        moves.push(encodeMove(from, to, 0, FLAG_CAPTURE));
      }
    }
  }

  private generateSlideMoves(moves: Move[], from: number, directions: number[], them: Color, capturesOnly: boolean): void {
    for (const direction of directions) {
      for (let to = from + direction; onBoard(to); to += direction) {
        const target = this.board[to];
        if (target === 0) {
          if (!capturesOnly) moves.push(encodeMove(from, to));
          continue;
        }
        if (pieceColor(target) === them) moves.push(encodeMove(from, to, 0, FLAG_CAPTURE));
        break;
      }
    }
  }

  private generateCastlingMoves(moves: Move[], from: number, us: Color): void {
    const home = us === WHITE ? 4 : 116;
    if (from !== home) return;
    const them = (us ^ 1) as Color;
    const kingSide = us === WHITE ? CASTLE_WHITE_KING : CASTLE_BLACK_KING;
    const queenSide = us === WHITE ? CASTLE_WHITE_QUEEN : CASTLE_BLACK_QUEEN;
    const board = this.board;
    if (!(this.castling & (kingSide | queenSide)) || this.isSquareAttacked(home, them)) return;
    if (
      this.castling & kingSide &&
      board[home + 1] === 0 &&
      board[home + 2] === 0 &&
      !this.isSquareAttacked(home + 1, them) &&
      !this.isSquareAttacked(home + 2, them)
    ) {
      moves.push(encodeMove(home, home + 2, 0, FLAG_CASTLE));
    }
    if (
      this.castling & queenSide &&
      board[home - 1] === 0 &&
      board[home - 2] === 0 &&
      board[home - 3] === 0 &&
      !this.isSquareAttacked(home - 1, them) &&
      !this.isSquareAttacked(home - 2, them)
    ) {
      moves.push(encodeMove(home, home - 2, 0, FLAG_CASTLE));
    }
  }

  /** Whether a pawn of `capturer` stands beside the pawn that just passed `square`. */
  private canCaptureEnPassant(square: number, capturer: Color): boolean {
    const pawnSquare = square + (capturer === WHITE ? -16 : 16);
    const pawn = makePiece(capturer, PAWN);
    return [pawnSquare - 1, pawnSquare + 1].some((source) => onBoard(source) && this.board[source] === pawn);
  }

  /** FEN may claim rights whose king or rook has moved; drop them so castling can never teleport a piece. */
  private dropImpossibleCastlingRights(): void {
    const has = (square: number, piece: number): boolean => this.board[square] === piece;
    const whiteKingHome = has(4, makePiece(WHITE, KING));
    const blackKingHome = has(116, makePiece(BLACK, KING));
    if (!whiteKingHome || !has(7, makePiece(WHITE, ROOK))) this.castling &= ~CASTLE_WHITE_KING;
    if (!whiteKingHome || !has(0, makePiece(WHITE, ROOK))) this.castling &= ~CASTLE_WHITE_QUEEN;
    if (!blackKingHome || !has(119, makePiece(BLACK, ROOK))) this.castling &= ~CASTLE_BLACK_KING;
    if (!blackKingHome || !has(112, makePiece(BLACK, ROOK))) this.castling &= ~CASTLE_BLACK_QUEEN;
  }

  private computeHash(): void {
    let hashLo = CASTLE_KEYS_LO[this.castling];
    let hashHi = CASTLE_KEYS_HI[this.castling];
    for (const square of BOARD_SQUARES) {
      const piece = this.board[square];
      if (piece === 0) continue;
      hashLo ^= PIECE_KEYS_LO[piece * 128 + square];
      hashHi ^= PIECE_KEYS_HI[piece * 128 + square];
    }
    if (this.epSquare !== -1) {
      hashLo ^= EP_KEYS_LO[this.epSquare & 7];
      hashHi ^= EP_KEYS_HI[this.epSquare & 7];
    }
    if (this.turn === BLACK) {
      hashLo ^= SIDE_KEY_LO;
      hashHi ^= SIDE_KEY_HI;
    }
    this.hashLo = hashLo;
    this.hashHi = hashHi;
  }
}
