/**
 * Chess position on a 0x88 board with incremental Zobrist hashing and make/unmake.
 *
 * Squares are 0x88 indices: `rank * 16 + file`, a1 = 0, h8 = 119. An index is on the board
 * when `(square & 0x88) === 0`, which makes off-board detection a single mask.
 *
 * Moves are packed integers so the engine can store millions of them without allocation:
 * bits 0-6 from, 7-13 to, 14-16 promotion piece type, 17+ flags.
 */

export type Color = 0 | 1;
export const WHITE: Color = 0;
export const BLACK: Color = 1;

export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

export const FLAG_CAPTURE = 1;
export const FLAG_EN_PASSANT = 2;
export const FLAG_CASTLE = 4;
export const FLAG_DOUBLE_PUSH = 8;

export const CASTLE_WHITE_KING = 1;
export const CASTLE_WHITE_QUEEN = 2;
export const CASTLE_BLACK_KING = 4;
export const CASTLE_BLACK_QUEEN = 8;

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const KNIGHT_OFFSETS = [33, 31, 18, 14, -33, -31, -18, -14];
const BISHOP_OFFSETS = [17, 15, -17, -15];
const ROOK_OFFSETS = [16, -16, 1, -1];
const KING_OFFSETS = [17, 15, -17, -15, 16, -16, 1, -1];
const PROMOTION_TYPES = [QUEEN, ROOK, BISHOP, KNIGHT];
const PIECE_LETTERS = " pnbrqk";

/** Builds a piece code from a type and colour. White pieces are 1-6, black pieces 9-14. */
export const makePiece = (type: number, color: Color): number => type | (color << 3);
/** Piece type (PAWN..KING) of a non-empty piece code. */
export const pieceType = (piece: number): number => piece & 7;
/** Colour of a non-empty piece code. */
export const pieceColor = (piece: number): Color => (piece >> 3) as Color;

/** Packs a move into an integer. */
export const encodeMove = (from: number, to: number, promotion = 0, flags = 0): number =>
  from | (to << 7) | (promotion << 14) | (flags << 17);
/** Origin square of a packed move. */
export const moveFrom = (move: number): number => move & 0x7f;
/** Destination square of a packed move. */
export const moveTo = (move: number): number => (move >> 7) & 0x7f;
/** Promotion piece type of a packed move, or 0. */
export const movePromotion = (move: number): number => (move >> 14) & 7;
/** Flag bits of a packed move. */
export const moveFlags = (move: number): number => move >> 17;

/** Converts a 0x88 square to algebraic notation such as "e4". */
export const squareName = (square: number): string =>
  String.fromCharCode(97 + (square & 7)) + String.fromCharCode(49 + (square >> 4));

/** Parses "e4" into a 0x88 square, or returns -1 for anything else. */
export const parseSquare = (name: string): number => {
  if (!/^[a-h][1-8]$/.test(name)) return -1;
  return (name.charCodeAt(1) - 49) * 16 + (name.charCodeAt(0) - 97);
};

/** Formats a packed move as UCI, for example "e2e4" or "e7e8q". */
export const moveToUci = (move: number): string => {
  const promotion = movePromotion(move);
  return squareName(moveFrom(move)) + squareName(moveTo(move)) + (promotion ? PIECE_LETTERS[promotion] : "");
};

const onBoard = (square: number): boolean => (square & 0x88) === 0;

/** Deterministic 32-bit PRNG so hashes are identical in the page and the worker. */
const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) | 0;
  };
};

interface ZobristTables {
  pieceLo: Int32Array;
  pieceHi: Int32Array;
  castleLo: Int32Array;
  castleHi: Int32Array;
  epLo: Int32Array;
  epHi: Int32Array;
  sideLo: number;
  sideHi: number;
}

const buildZobrist = (): ZobristTables => {
  const random = createRandom(0x0c0ffee);
  const fill = (size: number): Int32Array => Int32Array.from({ length: size }, () => random());
  return {
    pieceLo: fill(16 * 128),
    pieceHi: fill(16 * 128),
    castleLo: fill(16),
    castleHi: fill(16),
    epLo: fill(8),
    epHi: fill(8),
    sideLo: random(),
    sideHi: random(),
  };
};

const ZOBRIST = buildZobrist();

const CASTLE_MASK = new Int8Array(128).fill(15);
CASTLE_MASK[0] = 15 & ~CASTLE_WHITE_QUEEN;
CASTLE_MASK[4] = 15 & ~(CASTLE_WHITE_KING | CASTLE_WHITE_QUEEN);
CASTLE_MASK[7] = 15 & ~CASTLE_WHITE_KING;
CASTLE_MASK[112] = 15 & ~CASTLE_BLACK_QUEEN;
CASTLE_MASK[116] = 15 & ~(CASTLE_BLACK_KING | CASTLE_BLACK_QUEEN);
CASTLE_MASK[119] = 15 & ~CASTLE_BLACK_KING;

interface UndoRecord {
  move: number;
  captured: number;
  castling: number;
  epSquare: number;
  hashedEpFile: number;
  halfmoveClock: number;
  hashLo: number;
  hashHi: number;
}

/** Mutable chess position. All engine and game code shares this one implementation. */
export class Position {
  readonly board = new Int8Array(128);
  readonly kingSquare = [0, 0];
  turn: Color = WHITE;
  castling = 0;
  epSquare = -1;
  halfmoveClock = 0;
  fullmoveNumber = 1;
  hashLo = 0;
  hashHi = 0;
  /** File of the en passant square when it is part of the hash (an enemy pawn could capture), else -1. */
  private hashedEpFile = -1;
  private readonly undoStack: UndoRecord[] = [];
  /** Hash of every position reached, oldest first, for repetition detection. */
  readonly historyLo: number[] = [];
  readonly historyHi: number[] = [];

  /**
   * Parses and validates a FEN string. Throws an Error with a readable message when invalid.
   * The move counters are optional.
   */
  static fromFen(fen: string): Position {
    const fields = fen.trim().split(/\s+/);
    if (fields.length !== 6 && fields.length !== 4) throw new Error("FEN must have 4 or 6 fields");
    const [placement, side, castling, ep, halfmove = "0", fullmove = "1"] = fields;
    const position = new Position();
    position.parsePlacement(placement);
    if (side !== "w" && side !== "b") throw new Error("FEN side to move must be w or b");
    position.turn = side === "w" ? WHITE : BLACK;
    position.castling = parseCastling(castling, position.board);
    position.epSquare = parseEnPassant(ep, position.board, position.turn);
    if (!/^\d+$/.test(halfmove) || !/^\d+$/.test(fullmove) || Number(fullmove) < 1) {
      throw new Error("FEN move counters are invalid");
    }
    position.halfmoveClock = Number(halfmove);
    position.fullmoveNumber = Number(fullmove);
    if (position.isSquareAttacked(position.kingSquare[position.turn ^ 1], position.turn)) {
      throw new Error("FEN side not to move is in check");
    }
    position.recomputeHash();
    position.historyLo.push(position.hashLo);
    position.historyHi.push(position.hashHi);
    return position;
  }

  private parsePlacement(placement: string): void {
    const ranks = placement.split("/");
    if (ranks.length !== 8) throw new Error("FEN board must have 8 ranks");
    const kings = [0, 0];
    ranks.forEach((rankText, index) => {
      const rank = 7 - index;
      let file = 0;
      for (const char of rankText) {
        if (char >= "1" && char <= "8") {
          file += Number(char);
          continue;
        }
        const type = PIECE_LETTERS.indexOf(char.toLowerCase());
        if (type < 1 || file > 7) throw new Error(`FEN has an invalid piece "${char}"`);
        const color: Color = char === char.toLowerCase() ? BLACK : WHITE;
        if (type === PAWN && (rank === 0 || rank === 7)) throw new Error("FEN has a pawn on the first or last rank");
        const square = rank * 16 + file;
        this.board[square] = makePiece(type, color);
        if (type === KING) {
          kings[color] += 1;
          this.kingSquare[color] = square;
        }
        file += 1;
      }
      if (file !== 8) throw new Error(`FEN rank ${rank + 1} does not have 8 squares`);
    });
    if (kings[WHITE] !== 1 || kings[BLACK] !== 1) throw new Error("FEN must have exactly one king per side");
  }

  /** Serialises the position as a six-field FEN. */
  toFen(): string {
    const rows: string[] = [];
    for (let rank = 7; rank >= 0; rank--) {
      let row = "";
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const piece = this.board[rank * 16 + file];
        if (!piece) {
          empty += 1;
          continue;
        }
        if (empty) row += empty;
        empty = 0;
        const letter = PIECE_LETTERS[pieceType(piece)];
        row += pieceColor(piece) === WHITE ? letter.toUpperCase() : letter;
      }
      rows.push(empty ? row + empty : row);
    }
    const castling =
      (this.castling & CASTLE_WHITE_KING ? "K" : "") +
      (this.castling & CASTLE_WHITE_QUEEN ? "Q" : "") +
      (this.castling & CASTLE_BLACK_KING ? "k" : "") +
      (this.castling & CASTLE_BLACK_QUEEN ? "q" : "");
    const ep = this.epSquare >= 0 ? squareName(this.epSquare) : "-";
    return `${rows.join("/")} ${this.turn === WHITE ? "w" : "b"} ${castling || "-"} ${ep} ${this.halfmoveClock} ${this.fullmoveNumber}`;
  }

  /** Stable string form of the Zobrist hash, mainly for tests. */
  hashKey(): string {
    return `${this.hashHi >>> 0}:${this.hashLo >>> 0}`;
  }

  /** Number of moves made on this object that can still be unmade. */
  get ply(): number {
    return this.undoStack.length;
  }

  private epCapturePossible(epSquare: number, capturer: Color): boolean {
    const pawnSquare = epSquare + (capturer === WHITE ? -16 : 16);
    const capturingPawn = makePiece(PAWN, capturer);
    return (
      (onBoard(pawnSquare - 1) && this.board[pawnSquare - 1] === capturingPawn) ||
      (onBoard(pawnSquare + 1) && this.board[pawnSquare + 1] === capturingPawn)
    );
  }

  private recomputeHash(): void {
    let lo = 0;
    let hi = 0;
    for (let square = 0; square < 128; square++) {
      const piece = this.board[square];
      if (onBoard(square) && piece) {
        lo ^= ZOBRIST.pieceLo[piece * 128 + square];
        hi ^= ZOBRIST.pieceHi[piece * 128 + square];
      }
    }
    lo ^= ZOBRIST.castleLo[this.castling];
    hi ^= ZOBRIST.castleHi[this.castling];
    this.hashedEpFile = -1;
    if (this.epSquare >= 0 && this.epCapturePossible(this.epSquare, this.turn)) {
      this.hashedEpFile = this.epSquare & 7;
      lo ^= ZOBRIST.epLo[this.hashedEpFile];
      hi ^= ZOBRIST.epHi[this.hashedEpFile];
    }
    if (this.turn === BLACK) {
      lo ^= ZOBRIST.sideLo;
      hi ^= ZOBRIST.sideHi;
    }
    this.hashLo = lo;
    this.hashHi = hi;
  }

  private togglePiece(piece: number, square: number): void {
    this.hashLo ^= ZOBRIST.pieceLo[piece * 128 + square];
    this.hashHi ^= ZOBRIST.pieceHi[piece * 128 + square];
  }

  /** True when `square` is attacked by any piece of colour `by`. */
  isSquareAttacked(square: number, by: Color): boolean {
    const board = this.board;
    const pawn = makePiece(PAWN, by);
    if (by === WHITE) {
      if (onBoard(square - 15) && board[square - 15] === pawn) return true;
      if (onBoard(square - 17) && board[square - 17] === pawn) return true;
    } else {
      if (onBoard(square + 15) && board[square + 15] === pawn) return true;
      if (onBoard(square + 17) && board[square + 17] === pawn) return true;
    }
    const knight = makePiece(KNIGHT, by);
    for (const offset of KNIGHT_OFFSETS) {
      const from = square + offset;
      if (onBoard(from) && board[from] === knight) return true;
    }
    const king = makePiece(KING, by);
    for (const offset of KING_OFFSETS) {
      const from = square + offset;
      if (onBoard(from) && board[from] === king) return true;
    }
    const bishop = makePiece(BISHOP, by);
    const rook = makePiece(ROOK, by);
    const queen = makePiece(QUEEN, by);
    for (const offset of BISHOP_OFFSETS) {
      for (let from = square + offset; onBoard(from); from += offset) {
        const piece = board[from];
        if (!piece) continue;
        if (piece === bishop || piece === queen) return true;
        break;
      }
    }
    for (const offset of ROOK_OFFSETS) {
      for (let from = square + offset; onBoard(from); from += offset) {
        const piece = board[from];
        if (!piece) continue;
        if (piece === rook || piece === queen) return true;
        break;
      }
    }
    return false;
  }

  /** True when the side to move is in check. */
  inCheck(): boolean {
    return this.isSquareAttacked(this.kingSquare[this.turn], (this.turn ^ 1) as Color);
  }

  /** After makeMove: true when the side that just moved left its own king attacked (the move was illegal). */
  movedSideInCheck(): boolean {
    return this.isSquareAttacked(this.kingSquare[this.turn ^ 1], this.turn);
  }

  /**
   * Appends pseudo-legal moves to `out`. With `capturesOnly`, only captures and queen promotions
   * are generated (for quiescence search). Castling legality (not through check) is fully checked here.
   */
  generateMoves(out: number[], capturesOnly = false): void {
    const board = this.board;
    const us = this.turn;
    const them = (us ^ 1) as Color;
    for (let from = 0; from < 128; from++) {
      if (!onBoard(from)) {
        from += 7;
        continue;
      }
      const piece = board[from];
      if (!piece || pieceColor(piece) !== us) continue;
      const type = pieceType(piece);
      if (type === PAWN) {
        this.generatePawnMoves(from, us, out, capturesOnly);
        continue;
      }
      const sliding = type === BISHOP || type === ROOK || type === QUEEN;
      const offsets =
        type === KNIGHT ? KNIGHT_OFFSETS : type === BISHOP ? BISHOP_OFFSETS : type === ROOK ? ROOK_OFFSETS : KING_OFFSETS;
      for (const offset of offsets) {
        for (let to = from + offset; onBoard(to); to += offset) {
          const target = board[to];
          if (target) {
            if (pieceColor(target) === them) out.push(encodeMove(from, to, 0, FLAG_CAPTURE));
            break;
          }
          if (!capturesOnly) out.push(encodeMove(from, to));
          if (!sliding) break;
        }
      }
    }
    if (!capturesOnly) this.generateCastling(out);
  }

  private generatePawnMoves(from: number, us: Color, out: number[], capturesOnly: boolean): void {
    const board = this.board;
    const forward = us === WHITE ? 16 : -16;
    const startRank = us === WHITE ? 1 : 6;
    const lastRank = us === WHITE ? 7 : 0;
    const one = from + forward;
    if (onBoard(one) && !board[one]) {
      if (one >> 4 === lastRank) {
        if (capturesOnly) out.push(encodeMove(from, one, QUEEN));
        else for (const promotion of PROMOTION_TYPES) out.push(encodeMove(from, one, promotion));
      } else if (!capturesOnly) {
        out.push(encodeMove(from, one));
        const two = one + forward;
        if (from >> 4 === startRank && !board[two]) out.push(encodeMove(from, two, 0, FLAG_DOUBLE_PUSH));
      }
    }
    for (const side of [-1, 1]) {
      const to = one + side;
      if (!onBoard(to)) continue;
      const target = board[to];
      if (target && pieceColor(target) !== us) {
        if (to >> 4 === lastRank) {
          for (const promotion of PROMOTION_TYPES) out.push(encodeMove(from, to, promotion, FLAG_CAPTURE));
        } else {
          out.push(encodeMove(from, to, 0, FLAG_CAPTURE));
        }
      } else if (to === this.epSquare) {
        out.push(encodeMove(from, to, 0, FLAG_CAPTURE | FLAG_EN_PASSANT));
      }
    }
  }

  private generateCastling(out: number[]): void {
    const board = this.board;
    const us = this.turn;
    const them = (us ^ 1) as Color;
    const kingFrom = us === WHITE ? 4 : 116;
    const kingSide = us === WHITE ? CASTLE_WHITE_KING : CASTLE_BLACK_KING;
    const queenSide = us === WHITE ? CASTLE_WHITE_QUEEN : CASTLE_BLACK_QUEEN;
    if (!(this.castling & (kingSide | queenSide)) || this.kingSquare[us] !== kingFrom) return;
    if (this.isSquareAttacked(kingFrom, them)) return;
    if (
      this.castling & kingSide &&
      !board[kingFrom + 1] &&
      !board[kingFrom + 2] &&
      !this.isSquareAttacked(kingFrom + 1, them)
    ) {
      out.push(encodeMove(kingFrom, kingFrom + 2, 0, FLAG_CASTLE));
    }
    if (
      this.castling & queenSide &&
      !board[kingFrom - 1] &&
      !board[kingFrom - 2] &&
      !board[kingFrom - 3] &&
      !this.isSquareAttacked(kingFrom - 1, them)
    ) {
      out.push(encodeMove(kingFrom, kingFrom - 2, 0, FLAG_CASTLE));
    }
  }

  /** Every fully legal move for the side to move. */
  legalMoves(): number[] {
    const pseudo: number[] = [];
    this.generateMoves(pseudo);
    return pseudo.filter((move) => {
      this.makeMove(move);
      const legal = !this.movedSideInCheck();
      this.unmakeMove();
      return legal;
    });
  }

  /** Finds the legal move matching a UCI string, or null. Promotions must name the piece. */
  parseUci(uci: string): number | null {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
    return this.legalMoves().find((move) => moveToUci(move) === uci) ?? null;
  }

  /** Plays a pseudo-legal move. Callers must check movedSideInCheck() unless the move came from legalMoves(). */
  makeMove(move: number): void {
    const board = this.board;
    const from = moveFrom(move);
    const to = moveTo(move);
    const flags = moveFlags(move);
    const promotion = movePromotion(move);
    const us = this.turn;
    const piece = board[from];
    this.undoStack.push({
      move,
      captured: 0,
      castling: this.castling,
      epSquare: this.epSquare,
      hashedEpFile: this.hashedEpFile,
      halfmoveClock: this.halfmoveClock,
      hashLo: this.hashLo,
      hashHi: this.hashHi,
    });
    const undo = this.undoStack[this.undoStack.length - 1];

    if (this.hashedEpFile >= 0) {
      this.hashLo ^= ZOBRIST.epLo[this.hashedEpFile];
      this.hashHi ^= ZOBRIST.epHi[this.hashedEpFile];
    }
    this.hashLo ^= ZOBRIST.castleLo[this.castling];
    this.hashHi ^= ZOBRIST.castleHi[this.castling];

    if (flags & FLAG_EN_PASSANT) {
      const capturedSquare = to + (us === WHITE ? -16 : 16);
      undo.captured = board[capturedSquare];
      board[capturedSquare] = 0;
      this.togglePiece(undo.captured, capturedSquare);
    } else if (board[to]) {
      undo.captured = board[to];
      this.togglePiece(undo.captured, to);
    }

    const placed = promotion ? makePiece(promotion, us) : piece;
    board[from] = 0;
    this.togglePiece(piece, from);
    board[to] = placed;
    this.togglePiece(placed, to);

    if (flags & FLAG_CASTLE) {
      const rookFrom = to > from ? from + 3 : from - 4;
      const rookTo = to > from ? from + 1 : from - 1;
      const rook = board[rookFrom];
      board[rookFrom] = 0;
      board[rookTo] = rook;
      this.togglePiece(rook, rookFrom);
      this.togglePiece(rook, rookTo);
    }
    if (pieceType(piece) === KING) this.kingSquare[us] = to;

    this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
    this.hashLo ^= ZOBRIST.castleLo[this.castling];
    this.hashHi ^= ZOBRIST.castleHi[this.castling];

    const them = (us ^ 1) as Color;
    this.epSquare = -1;
    this.hashedEpFile = -1;
    if (flags & FLAG_DOUBLE_PUSH) {
      this.epSquare = (from + to) >> 1;
      if (this.epCapturePossible(this.epSquare, them)) {
        this.hashedEpFile = to & 7;
        this.hashLo ^= ZOBRIST.epLo[this.hashedEpFile];
        this.hashHi ^= ZOBRIST.epHi[this.hashedEpFile];
      }
    }

    this.halfmoveClock = pieceType(piece) === PAWN || undo.captured ? 0 : this.halfmoveClock + 1;
    if (us === BLACK) this.fullmoveNumber += 1;
    this.turn = them;
    this.hashLo ^= ZOBRIST.sideLo;
    this.hashHi ^= ZOBRIST.sideHi;
    this.historyLo.push(this.hashLo);
    this.historyHi.push(this.hashHi);
  }

  /** Reverts the most recent makeMove or makeNullMove. */
  unmakeMove(): void {
    const undo = this.undoStack.pop();
    if (!undo) throw new Error("No move to unmake");
    this.historyLo.pop();
    this.historyHi.pop();
    const us = (this.turn ^ 1) as Color;
    this.turn = us;
    this.castling = undo.castling;
    this.epSquare = undo.epSquare;
    this.hashedEpFile = undo.hashedEpFile;
    this.halfmoveClock = undo.halfmoveClock;
    this.hashLo = undo.hashLo;
    this.hashHi = undo.hashHi;
    if (us === BLACK) this.fullmoveNumber -= 1;
    if (undo.move === 0) return;

    const board = this.board;
    const move = undo.move;
    const from = moveFrom(move);
    const to = moveTo(move);
    const flags = moveFlags(move);
    const moved = movePromotion(move) ? makePiece(PAWN, us) : board[to];
    board[from] = moved;
    if (flags & FLAG_EN_PASSANT) {
      board[to] = 0;
      board[to + (us === WHITE ? -16 : 16)] = undo.captured;
    } else {
      board[to] = undo.captured;
    }
    if (flags & FLAG_CASTLE) {
      const rookFrom = to > from ? from + 3 : from - 4;
      const rookTo = to > from ? from + 1 : from - 1;
      board[rookFrom] = board[rookTo];
      board[rookTo] = 0;
    }
    if (pieceType(moved) === KING) this.kingSquare[us] = from;
  }

  /** Passes the turn without moving (null-move pruning). Never call while in check. */
  makeNullMove(): void {
    this.undoStack.push({
      move: 0,
      captured: 0,
      castling: this.castling,
      epSquare: this.epSquare,
      hashedEpFile: this.hashedEpFile,
      halfmoveClock: this.halfmoveClock,
      hashLo: this.hashLo,
      hashHi: this.hashHi,
    });
    if (this.hashedEpFile >= 0) {
      this.hashLo ^= ZOBRIST.epLo[this.hashedEpFile];
      this.hashHi ^= ZOBRIST.epHi[this.hashedEpFile];
    }
    this.epSquare = -1;
    this.hashedEpFile = -1;
    this.halfmoveClock += 1;
    if (this.turn === BLACK) this.fullmoveNumber += 1;
    this.turn = (this.turn ^ 1) as Color;
    this.hashLo ^= ZOBRIST.sideLo;
    this.hashHi ^= ZOBRIST.sideHi;
    this.historyLo.push(this.hashLo);
    this.historyHi.push(this.hashHi);
  }

  /**
   * How many earlier positions in the history equal the current one. Only positions since the
   * last irreversible move (pawn move or capture) can repeat, so the scan stops there.
   */
  repetitionCount(): number {
    const last = this.historyLo.length - 1;
    const stop = Math.max(0, last - this.halfmoveClock);
    let count = 0;
    for (let index = last - 2; index >= stop; index -= 2) {
      if (this.historyLo[index] === this.hashLo && this.historyHi[index] === this.hashHi) count += 1;
    }
    return count;
  }
}

const parseCastling = (text: string, board: Int8Array): number => {
  if (text === "-") return 0;
  if (!/^(K?Q?k?q?)$/.test(text) || text.length === 0) throw new Error("FEN castling field is invalid");
  const requirements: [string, number, number, number, number][] = [
    ["K", CASTLE_WHITE_KING, 4, 7, WHITE],
    ["Q", CASTLE_WHITE_QUEEN, 4, 0, WHITE],
    ["k", CASTLE_BLACK_KING, 116, 119, BLACK],
    ["q", CASTLE_BLACK_QUEEN, 116, 112, BLACK],
  ];
  let rights = 0;
  for (const [letter, flag, kingSquare, rookSquare, color] of requirements) {
    if (!text.includes(letter)) continue;
    const side = color as Color;
    if (board[kingSquare] !== makePiece(KING, side) || board[rookSquare] !== makePiece(ROOK, side)) {
      throw new Error(`FEN castling right ${letter} needs the king and rook on their original squares`);
    }
    rights |= flag;
  }
  return rights;
};

const parseEnPassant = (text: string, board: Int8Array, turn: Color): number => {
  if (text === "-") return -1;
  const square = parseSquare(text);
  const expectedRank = turn === WHITE ? 5 : 2;
  if (square < 0 || square >> 4 !== expectedRank) throw new Error("FEN en passant square is invalid");
  const pusher = (turn ^ 1) as Color;
  const pawnSquare = square + (turn === WHITE ? -16 : 16);
  const originSquare = square + (turn === WHITE ? 16 : -16);
  if (board[square] || board[originSquare] || board[pawnSquare] !== makePiece(PAWN, pusher)) {
    throw new Error("FEN en passant square does not follow a double pawn push");
  }
  return square;
};

/** Counts leaf nodes of the legal move tree to `depth`. Used to verify move generation. */
export const perft = (position: Position, depth: number): number => {
  if (depth === 0) return 1;
  const moves: number[] = [];
  position.generateMoves(moves);
  let nodes = 0;
  for (const move of moves) {
    position.makeMove(move);
    if (!position.movedSideInCheck()) nodes += depth === 1 ? 1 : perft(position, depth - 1);
    position.unmakeMove();
  }
  return nodes;
};
