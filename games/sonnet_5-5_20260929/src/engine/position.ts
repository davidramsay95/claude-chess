/**
 * Board representation, move generation and make/unmake for the chess engine.
 *
 * The board is a 0x88 mailbox: square = rank * 16 + file, a1 = 0, h8 = 119.
 * A square is off the board when `(sq & 0x88) !== 0`, which makes ray walking
 * and knight jumps free of bounds tables.
 *
 * A move is packed into one integer:
 *   bits 0-6 from, bits 7-13 to, bits 14-16 promotion piece type, bits 17+ flag.
 */

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const WHITE = 0;
export const BLACK = 1;

export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

export const FLAG_NONE = 0;
export const FLAG_CAPTURE = 1;
export const FLAG_EN_PASSANT = 2;
export const FLAG_CASTLE = 3;
export const FLAG_DOUBLE_PUSH = 4;

export const CASTLE_WHITE_KING = 1;
export const CASTLE_WHITE_QUEEN = 2;
export const CASTLE_BLACK_KING = 4;
export const CASTLE_BLACK_QUEEN = 8;

const KNIGHT_OFFSETS = [33, 31, 18, 14, -14, -18, -31, -33];
const KING_OFFSETS = [1, -1, 16, -16, 15, 17, -15, -17];
const BISHOP_DIRECTIONS = [15, 17, -15, -17];
const ROOK_DIRECTIONS = [1, -1, 16, -16];
const PROMOTION_ORDER = [QUEEN, ROOK, BISHOP, KNIGHT];

const SQUARES: number[] = [];
for (let rank = 0; rank < 8; rank++) {
  for (let file = 0; file < 8; file++) SQUARES.push(rank * 16 + file);
}

const CASTLE_MASK = new Int32Array(128).fill(15);
CASTLE_MASK[0] = ~CASTLE_WHITE_QUEEN & 15;
CASTLE_MASK[4] = ~(CASTLE_WHITE_KING | CASTLE_WHITE_QUEEN) & 15;
CASTLE_MASK[7] = ~CASTLE_WHITE_KING & 15;
CASTLE_MASK[112] = ~CASTLE_BLACK_QUEEN & 15;
CASTLE_MASK[116] = ~(CASTLE_BLACK_KING | CASTLE_BLACK_QUEEN) & 15;
CASTLE_MASK[119] = ~CASTLE_BLACK_KING & 15;

const makeRandomStream = (seed: number): (() => number) => {
  let state = seed | 0;
  return (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state | 0;
  };
};

const nextRandom = makeRandomStream(0x2545f491);
const ZOBRIST_PIECE_HI = new Int32Array(15 * 128).map(() => nextRandom());
const ZOBRIST_PIECE_LO = new Int32Array(15 * 128).map(() => nextRandom());
const ZOBRIST_CASTLE_HI = new Int32Array(16).map(() => nextRandom());
const ZOBRIST_CASTLE_LO = new Int32Array(16).map(() => nextRandom());
const ZOBRIST_EP_HI = new Int32Array(8).map(() => nextRandom());
const ZOBRIST_EP_LO = new Int32Array(8).map(() => nextRandom());
const ZOBRIST_SIDE_HI = nextRandom();
const ZOBRIST_SIDE_LO = nextRandom();

export const moveFrom = (move: number): number => move & 127;
export const moveTo = (move: number): number => (move >> 7) & 127;
export const movePromotion = (move: number): number => (move >> 14) & 7;
export const moveFlag = (move: number): number => move >> 17;

export const encodeMove = (from: number, to: number, promotion: number, flag: number): number =>
  from | (to << 7) | (promotion << 14) | (flag << 17);

export const pieceColor = (piece: number): number => piece >> 3;
export const pieceType = (piece: number): number => piece & 7;
export const makePiece = (type: number, color: number): number => type | (color << 3);

export const squareName = (square: number): string =>
  `${String.fromCharCode(97 + (square & 7))}${(square >> 4) + 1}`;

/** Parses "e4" into a 0x88 square, or returns -1 when malformed. */
export const parseSquare = (text: string): number => {
  if (text.length !== 2) return -1;
  const file = text.charCodeAt(0) - 97;
  const rank = text.charCodeAt(1) - 49;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return -1;
  return rank * 16 + file;
};

const PROMOTION_LETTERS = " pnbrqk";

export const moveToUci = (move: number): string => {
  const promotion = movePromotion(move);
  const suffix = promotion === 0 ? "" : PROMOTION_LETTERS[promotion];
  return `${squareName(moveFrom(move))}${squareName(moveTo(move))}${suffix}`;
};

const PIECE_LETTERS = " PNBRQK";

/** A castling right is only kept when the king and rook are still on their home squares. */
const sanitizeCastling = (board: Int8Array, rights: number): number => {
  let result = rights;
  const has = (square: number, piece: number): boolean => board[square] === piece;
  if (!(has(4, makePiece(KING, WHITE)) && has(7, makePiece(ROOK, WHITE)))) result &= ~CASTLE_WHITE_KING;
  if (!(has(4, makePiece(KING, WHITE)) && has(0, makePiece(ROOK, WHITE)))) result &= ~CASTLE_WHITE_QUEEN;
  if (!(has(116, makePiece(KING, BLACK)) && has(119, makePiece(ROOK, BLACK)))) result &= ~CASTLE_BLACK_KING;
  if (!(has(116, makePiece(KING, BLACK)) && has(112, makePiece(ROOK, BLACK)))) result &= ~CASTLE_BLACK_QUEEN;
  return result & 15;
};

export class Position {
  board = new Int8Array(128);
  side = WHITE;
  castling = 0;
  /** En passant target square (the square behind the pawn that just double-pushed), or -1. */
  ep = -1;
  halfmove = 0;
  fullmove = 1;
  kingSquare = [-1, -1];
  hashHi = 0;
  hashLo = 0;

  private undoMove: number[] = [];
  private undoCaptured: number[] = [];
  private undoCastling: number[] = [];
  private undoEp: number[] = [];
  private undoHalfmove: number[] = [];
  private undoHashHi: number[] = [];
  private undoHashLo: number[] = [];

  /** Number of half-moves made on this instance since it was created from FEN. */
  get ply(): number {
    return this.undoMove.length;
  }

  static fromFen(fen: string): Position {
    const position = new Position();
    position.loadFen(fen);
    return position;
  }

  private loadFen(fen: string): void {
    const fields = fen.trim().split(/\s+/);
    if (fields.length < 4 || fields.length > 6) throw new Error("FEN must have 4 to 6 fields");
    const [placement, sideText, castlingText, epText] = fields;
    const halfmoveText = fields[4] ?? "0";
    const fullmoveText = fields[5] ?? "1";

    const ranks = placement.split("/");
    if (ranks.length !== 8) throw new Error("FEN placement must have 8 ranks");
    const kings = [0, 0];
    ranks.forEach((rankText, index) => {
      const rank = 7 - index;
      let file = 0;
      for (const char of rankText) {
        if (char >= "1" && char <= "8") {
          file += Number(char);
          continue;
        }
        const lower = char.toLowerCase();
        const type = PIECE_LETTERS.indexOf(lower.toUpperCase());
        if (type < 1 || file > 7) throw new Error(`Invalid FEN placement near "${char}"`);
        const color = char === lower ? BLACK : WHITE;
        if (type === PAWN && (rank === 0 || rank === 7)) throw new Error("Pawns cannot stand on the first or last rank");
        const square = rank * 16 + file;
        this.board[square] = makePiece(type, color);
        if (type === KING) {
          kings[color]++;
          this.kingSquare[color] = square;
        }
        file++;
      }
      if (file !== 8) throw new Error(`FEN rank ${rank + 1} does not have 8 files`);
    });
    if (kings[WHITE] !== 1 || kings[BLACK] !== 1) throw new Error("Each side needs exactly one king");

    if (sideText !== "w" && sideText !== "b") throw new Error("FEN side to move must be w or b");
    this.side = sideText === "w" ? WHITE : BLACK;

    let rights = 0;
    if (castlingText !== "-") {
      for (const char of castlingText) {
        if (char === "K") rights |= CASTLE_WHITE_KING;
        else if (char === "Q") rights |= CASTLE_WHITE_QUEEN;
        else if (char === "k") rights |= CASTLE_BLACK_KING;
        else if (char === "q") rights |= CASTLE_BLACK_QUEEN;
        else throw new Error("Invalid FEN castling field");
      }
    }
    this.castling = sanitizeCastling(this.board, rights);

    if (epText === "-") {
      this.ep = -1;
    } else {
      const square = parseSquare(epText);
      const expectedRank = this.side === WHITE ? 5 : 2;
      if (square < 0 || square >> 4 !== expectedRank) throw new Error("Invalid FEN en passant square");
      this.ep = square;
    }

    if (!/^\d+$/.test(halfmoveText) || !/^\d+$/.test(fullmoveText)) throw new Error("Invalid FEN move counters");
    this.halfmove = Number(halfmoveText);
    this.fullmove = Math.max(1, Number(fullmoveText));

    const waiting = this.side ^ 1;
    if (this.isAttacked(this.kingSquare[waiting], this.side)) {
      throw new Error("The side that is not to move is in check");
    }
    this.computeHash();
  }

  toFen(): string {
    const rows: string[] = [];
    for (let rank = 7; rank >= 0; rank--) {
      let row = "";
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const piece = this.board[rank * 16 + file];
        if (piece === 0) {
          empty++;
          continue;
        }
        if (empty > 0) row += String(empty);
        empty = 0;
        const letter = PIECE_LETTERS[pieceType(piece)];
        row += pieceColor(piece) === WHITE ? letter : letter.toLowerCase();
      }
      if (empty > 0) row += String(empty);
      rows.push(row);
    }
    let rights = "";
    if (this.castling & CASTLE_WHITE_KING) rights += "K";
    if (this.castling & CASTLE_WHITE_QUEEN) rights += "Q";
    if (this.castling & CASTLE_BLACK_KING) rights += "k";
    if (this.castling & CASTLE_BLACK_QUEEN) rights += "q";
    const ep = this.ep >= 0 ? squareName(this.ep) : "-";
    return `${rows.join("/")} ${this.side === WHITE ? "w" : "b"} ${rights || "-"} ${ep} ${this.halfmove} ${this.fullmove}`;
  }

  /** True when a pawn of the side to move can pseudo-legally capture on the en passant square. */
  private epCapturable(): boolean {
    if (this.ep < 0) return false;
    const pawn = makePiece(PAWN, this.side);
    const behind = this.side === WHITE ? -16 : 16;
    const left = this.ep + behind - 1;
    const right = this.ep + behind + 1;
    return ((left & 0x88) === 0 && this.board[left] === pawn) || ((right & 0x88) === 0 && this.board[right] === pawn);
  }

  private computeHash(): void {
    let hi = 0;
    let lo = 0;
    for (const square of SQUARES) {
      const piece = this.board[square];
      if (piece === 0) continue;
      hi ^= ZOBRIST_PIECE_HI[piece * 128 + square];
      lo ^= ZOBRIST_PIECE_LO[piece * 128 + square];
    }
    hi ^= ZOBRIST_CASTLE_HI[this.castling];
    lo ^= ZOBRIST_CASTLE_LO[this.castling];
    if (this.side === BLACK) {
      hi ^= ZOBRIST_SIDE_HI;
      lo ^= ZOBRIST_SIDE_LO;
    }
    if (this.epCapturable()) {
      hi ^= ZOBRIST_EP_HI[this.ep & 7];
      lo ^= ZOBRIST_EP_LO[this.ep & 7];
    }
    this.hashHi = hi;
    this.hashLo = lo;
  }

  private togglePiece(piece: number, square: number): void {
    this.hashHi ^= ZOBRIST_PIECE_HI[piece * 128 + square];
    this.hashLo ^= ZOBRIST_PIECE_LO[piece * 128 + square];
  }

  /** True when `square` is attacked by any piece of colour `by`. */
  isAttacked(square: number, by: number): boolean {
    const board = this.board;
    const pawnDirection = by === WHITE ? -16 : 16;
    const pawn = makePiece(PAWN, by);
    let from = square + pawnDirection - 1;
    if ((from & 0x88) === 0 && board[from] === pawn) return true;
    from = square + pawnDirection + 1;
    if ((from & 0x88) === 0 && board[from] === pawn) return true;

    const knight = makePiece(KNIGHT, by);
    for (const offset of KNIGHT_OFFSETS) {
      from = square + offset;
      if ((from & 0x88) === 0 && board[from] === knight) return true;
    }
    const king = makePiece(KING, by);
    for (const offset of KING_OFFSETS) {
      from = square + offset;
      if ((from & 0x88) === 0 && board[from] === king) return true;
    }
    const bishop = makePiece(BISHOP, by);
    const rook = makePiece(ROOK, by);
    const queen = makePiece(QUEEN, by);
    for (const direction of BISHOP_DIRECTIONS) {
      from = square + direction;
      while ((from & 0x88) === 0) {
        const piece = board[from];
        if (piece !== 0) {
          if (piece === bishop || piece === queen) return true;
          break;
        }
        from += direction;
      }
    }
    for (const direction of ROOK_DIRECTIONS) {
      from = square + direction;
      while ((from & 0x88) === 0) {
        const piece = board[from];
        if (piece !== 0) {
          if (piece === rook || piece === queen) return true;
          break;
        }
        from += direction;
      }
    }
    return false;
  }

  inCheck(): boolean {
    return this.isAttacked(this.kingSquare[this.side], this.side ^ 1);
  }

  /**
   * Writes pseudo-legal moves (which may leave the own king in check) into
   * `out` starting at `start`, and returns the new end index. With
   * `capturesOnly` only captures and queen promotions are produced.
   */
  generatePseudo(out: Int32Array, start: number, capturesOnly: boolean): number {
    let count = start;
    const board = this.board;
    const us = this.side;
    const them = us ^ 1;

    for (let i = 0; i < 64; i++) {
      const from = SQUARES[i];
      const piece = board[from];
      if (piece === 0 || pieceColor(piece) !== us) continue;
      const type = pieceType(piece);

      if (type === PAWN) {
        const direction = us === WHITE ? 16 : -16;
        const startRank = us === WHITE ? 1 : 6;
        const beforePromotionRank = us === WHITE ? 6 : 1;
        const rank = from >> 4;
        const promoting = rank === beforePromotionRank;
        const one = from + direction;
        if (board[one] === 0) {
          if (promoting) {
            const limit = capturesOnly ? 1 : 4;
            for (let p = 0; p < limit; p++) out[count++] = encodeMove(from, one, PROMOTION_ORDER[p], FLAG_NONE);
          } else if (!capturesOnly) {
            out[count++] = encodeMove(from, one, 0, FLAG_NONE);
            const two = one + direction;
            if (rank === startRank && board[two] === 0) out[count++] = encodeMove(from, two, 0, FLAG_DOUBLE_PUSH);
          }
        }
        for (let side = -1; side <= 1; side += 2) {
          const to = from + direction + side;
          if ((to & 0x88) !== 0) continue;
          const target = board[to];
          if (target !== 0 && pieceColor(target) === them) {
            if (promoting) {
              const limit = capturesOnly ? 1 : 4;
              for (let p = 0; p < limit; p++) out[count++] = encodeMove(from, to, PROMOTION_ORDER[p], FLAG_CAPTURE);
            } else {
              out[count++] = encodeMove(from, to, 0, FLAG_CAPTURE);
            }
          } else if (to === this.ep) {
            out[count++] = encodeMove(from, to, 0, FLAG_EN_PASSANT);
          }
        }
        continue;
      }

      if (type === KNIGHT || type === KING) {
        const offsets = type === KNIGHT ? KNIGHT_OFFSETS : KING_OFFSETS;
        for (let k = 0; k < 8; k++) {
          const to = from + offsets[k];
          if ((to & 0x88) !== 0) continue;
          const target = board[to];
          if (target === 0) {
            if (!capturesOnly) out[count++] = encodeMove(from, to, 0, FLAG_NONE);
          } else if (pieceColor(target) === them) {
            out[count++] = encodeMove(from, to, 0, FLAG_CAPTURE);
          }
        }
        continue;
      }

      const bishopMoves = type === BISHOP || type === QUEEN;
      const rookMoves = type === ROOK || type === QUEEN;
      for (let pass = 0; pass < 2; pass++) {
        if (pass === 0 ? !bishopMoves : !rookMoves) continue;
        const directions = pass === 0 ? BISHOP_DIRECTIONS : ROOK_DIRECTIONS;
        for (let d = 0; d < 4; d++) {
          const direction = directions[d];
          let to = from + direction;
          while ((to & 0x88) === 0) {
            const target = board[to];
            if (target === 0) {
              if (!capturesOnly) out[count++] = encodeMove(from, to, 0, FLAG_NONE);
            } else {
              if (pieceColor(target) === them) out[count++] = encodeMove(from, to, 0, FLAG_CAPTURE);
              break;
            }
            to += direction;
          }
        }
      }
    }

    if (!capturesOnly) count = this.generateCastling(out, count);
    return count;
  }

  private generateCastling(out: Int32Array, start: number): number {
    let count = start;
    const us = this.side;
    const them = us ^ 1;
    const homeRank = us === WHITE ? 0 : 112;
    const kingRight = us === WHITE ? CASTLE_WHITE_KING : CASTLE_BLACK_KING;
    const queenRight = us === WHITE ? CASTLE_WHITE_QUEEN : CASTLE_BLACK_QUEEN;
    if ((this.castling & (kingRight | queenRight)) === 0) return count;
    const e = homeRank + 4;
    if (this.isAttacked(e, them)) return count;
    const board = this.board;
    if (
      (this.castling & kingRight) !== 0 &&
      board[e + 1] === 0 &&
      board[e + 2] === 0 &&
      !this.isAttacked(e + 1, them) &&
      !this.isAttacked(e + 2, them)
    ) {
      out[count++] = encodeMove(e, e + 2, 0, FLAG_CASTLE);
    }
    if (
      (this.castling & queenRight) !== 0 &&
      board[e - 1] === 0 &&
      board[e - 2] === 0 &&
      board[e - 3] === 0 &&
      !this.isAttacked(e - 1, them) &&
      !this.isAttacked(e - 2, them)
    ) {
      out[count++] = encodeMove(e, e - 2, 0, FLAG_CASTLE);
    }
    return count;
  }

  makeMove(move: number): void {
    const board = this.board;
    const from = moveFrom(move);
    const to = moveTo(move);
    const promotion = movePromotion(move);
    const flag = moveFlag(move);
    const us = this.side;
    const piece = board[from];

    this.undoMove.push(move);
    this.undoCaptured.push(board[to]);
    this.undoCastling.push(this.castling);
    this.undoEp.push(this.ep);
    this.undoHalfmove.push(this.halfmove);
    this.undoHashHi.push(this.hashHi);
    this.undoHashLo.push(this.hashLo);

    if (this.epCapturable()) {
      this.hashHi ^= ZOBRIST_EP_HI[this.ep & 7];
      this.hashLo ^= ZOBRIST_EP_LO[this.ep & 7];
    }
    this.hashHi ^= ZOBRIST_CASTLE_HI[this.castling];
    this.hashLo ^= ZOBRIST_CASTLE_LO[this.castling];

    const captured = board[to];
    if (captured !== 0) this.togglePiece(captured, to);
    this.togglePiece(piece, from);
    board[from] = 0;

    if (flag === FLAG_EN_PASSANT) {
      const captureSquare = us === WHITE ? to - 16 : to + 16;
      this.togglePiece(board[captureSquare], captureSquare);
      board[captureSquare] = 0;
    }

    const placed = promotion !== 0 ? makePiece(promotion, us) : piece;
    board[to] = placed;
    this.togglePiece(placed, to);
    if (pieceType(piece) === KING) this.kingSquare[us] = to;

    if (flag === FLAG_CASTLE) {
      const kingSide = to > from;
      const rookFrom = kingSide ? to + 1 : to - 2;
      const rookTo = kingSide ? to - 1 : to + 1;
      const rook = board[rookFrom];
      this.togglePiece(rook, rookFrom);
      this.togglePiece(rook, rookTo);
      board[rookTo] = rook;
      board[rookFrom] = 0;
    }

    this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
    this.ep = flag === FLAG_DOUBLE_PUSH ? (from + to) >> 1 : -1;
    this.halfmove = pieceType(piece) === PAWN || captured !== 0 || flag === FLAG_EN_PASSANT ? 0 : this.halfmove + 1;
    if (us === BLACK) this.fullmove++;
    this.side = us ^ 1;

    this.hashHi ^= ZOBRIST_CASTLE_HI[this.castling] ^ ZOBRIST_SIDE_HI;
    this.hashLo ^= ZOBRIST_CASTLE_LO[this.castling] ^ ZOBRIST_SIDE_LO;
    if (this.epCapturable()) {
      this.hashHi ^= ZOBRIST_EP_HI[this.ep & 7];
      this.hashLo ^= ZOBRIST_EP_LO[this.ep & 7];
    }
  }

  unmakeMove(): void {
    const move = this.undoMove.pop() as number;
    const captured = this.undoCaptured.pop() as number;
    const board = this.board;
    const from = moveFrom(move);
    const to = moveTo(move);
    const promotion = movePromotion(move);
    const flag = moveFlag(move);

    this.side ^= 1;
    const us = this.side;
    if (us === BLACK) this.fullmove--;
    this.castling = this.undoCastling.pop() as number;
    this.ep = this.undoEp.pop() as number;
    this.halfmove = this.undoHalfmove.pop() as number;
    this.hashHi = this.undoHashHi.pop() as number;
    this.hashLo = this.undoHashLo.pop() as number;

    const moved = promotion !== 0 ? makePiece(PAWN, us) : board[to];
    board[from] = moved;
    board[to] = captured;
    if (pieceType(moved) === KING) this.kingSquare[us] = from;

    if (flag === FLAG_EN_PASSANT) {
      board[to] = 0;
      board[us === WHITE ? to - 16 : to + 16] = makePiece(PAWN, us ^ 1);
    } else if (flag === FLAG_CASTLE) {
      const kingSide = to > from;
      const rookFrom = kingSide ? to + 1 : to - 2;
      const rookTo = kingSide ? to - 1 : to + 1;
      board[rookFrom] = board[rookTo];
      board[rookTo] = 0;
    }
  }

  /** Passes the turn without moving; used by null-move pruning in search only. */
  makeNullMove(): void {
    this.undoMove.push(0);
    this.undoCaptured.push(0);
    this.undoCastling.push(this.castling);
    this.undoEp.push(this.ep);
    this.undoHalfmove.push(this.halfmove);
    this.undoHashHi.push(this.hashHi);
    this.undoHashLo.push(this.hashLo);

    if (this.epCapturable()) {
      this.hashHi ^= ZOBRIST_EP_HI[this.ep & 7];
      this.hashLo ^= ZOBRIST_EP_LO[this.ep & 7];
    }
    this.hashHi ^= ZOBRIST_SIDE_HI;
    this.hashLo ^= ZOBRIST_SIDE_LO;
    this.ep = -1;
    this.halfmove++;
    if (this.side === BLACK) this.fullmove++;
    this.side ^= 1;
  }

  unmakeNullMove(): void {
    this.undoMove.pop();
    this.undoCaptured.pop();
    this.side ^= 1;
    if (this.side === BLACK) this.fullmove--;
    this.castling = this.undoCastling.pop() as number;
    this.ep = this.undoEp.pop() as number;
    this.halfmove = this.undoHalfmove.pop() as number;
    this.hashHi = this.undoHashHi.pop() as number;
    this.hashLo = this.undoHashLo.pop() as number;
  }

  /** All strictly legal moves for the side to move. */
  legalMoves(): number[] {
    const buffer = new Int32Array(256);
    const total = this.generatePseudo(buffer, 0, false);
    const legal: number[] = [];
    const us = this.side;
    for (let i = 0; i < total; i++) {
      this.makeMove(buffer[i]);
      if (!this.isAttacked(this.kingSquare[us], us ^ 1)) legal.push(buffer[i]);
      this.unmakeMove();
    }
    return legal;
  }

  /** Finds the legal move matching a UCI string, or returns 0 when there is none. */
  parseUci(text: string): number {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(text)) return 0;
    for (const move of this.legalMoves()) {
      if (moveToUci(move) === text) return move;
    }
    return 0;
  }

  /**
   * How many times the current position has occurred, counting itself.
   * Only positions since the last irreversible move can repeat.
   */
  repetitionCount(): number {
    let count = 1;
    const limit = Math.max(0, this.ply - this.halfmove);
    for (let i = this.ply - 2; i >= limit; i -= 2) {
      if (this.undoHashLo[i] === this.hashLo && this.undoHashHi[i] === this.hashHi) count++;
    }
    return count;
  }

  /** True when neither side can ever deliver checkmate by any sequence of legal moves. */
  isInsufficientMaterial(): boolean {
    let knights = 0;
    let lightBishops = 0;
    let darkBishops = 0;
    for (const square of SQUARES) {
      const piece = this.board[square];
      if (piece === 0) continue;
      const type = pieceType(piece);
      if (type === KING) continue;
      if (type === KNIGHT) knights++;
      else if (type === BISHOP) {
        if (((square >> 4) + (square & 7)) % 2 === 0) darkBishops++;
        else lightBishops++;
      } else return false;
    }
    const bishops = lightBishops + darkBishops;
    if (knights + bishops <= 1) return true;
    return knights === 0 && (lightBishops === 0 || darkBishops === 0);
  }

  /** The 64-bit position key as a string, usable in maps. */
  get key(): string {
    return `${this.hashHi >>> 0}:${this.hashLo >>> 0}`;
  }
}
