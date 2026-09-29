import {
  BISHOP,
  BISHOP_DELTAS,
  BLACK,
  CASTLE_BK,
  CASTLE_BQ,
  CASTLE_WK,
  CASTLE_WQ,
  type Color,
  EMPTY,
  KING,
  KING_DELTAS,
  KNIGHT,
  KNIGHT_DELTAS,
  NO_SQUARE,
  PAWN,
  QUEEN,
  ROOK,
  ROOK_DELTAS,
  WHITE,
  colorOf,
  fileOf,
  isOnBoard,
  pieceFromChar,
  pieceOf,
  pieceToChar,
  rankOf,
  squareFromName,
  squareOf,
  squareToName,
  typeOf,
} from "./types";
import {
  FLAG_CASTLE,
  FLAG_DOUBLE_PUSH,
  FLAG_EN_PASSANT,
  type Move,
  encodeMove,
  moveCaptured,
  moveFlags,
  moveFrom,
  movePiece,
  movePromotion,
  moveTo,
} from "./move";
import { castleKeyIndex, combineHash, epKeyIndex, keyHi, keyLo, pieceKeyIndex, sideKeyIndex } from "./zobrist";

const A1 = squareOf(0, 0);
const E1 = squareOf(4, 0);
const H1 = squareOf(7, 0);
const A8 = squareOf(0, 7);
const E8 = squareOf(4, 7);
const H8 = squareOf(7, 7);

/**
 * Castling rights that survive a move touching a square. Moving the king or
 * a rook, or capturing a rook on its home square, strips the matching right.
 */
const CASTLE_MASK = new Int8Array(128).fill(15);
CASTLE_MASK[E1] = 15 & ~(CASTLE_WK | CASTLE_WQ);
CASTLE_MASK[H1] = 15 & ~CASTLE_WK;
CASTLE_MASK[A1] = 15 & ~CASTLE_WQ;
CASTLE_MASK[E8] = 15 & ~(CASTLE_BK | CASTLE_BQ);
CASTLE_MASK[H8] = 15 & ~CASTLE_BK;
CASTLE_MASK[A8] = 15 & ~CASTLE_BQ;

const PROMOTION_TYPES = [QUEEN, ROOK, BISHOP, KNIGHT] as const;

export interface Undo {
  castling: number;
  epSquare: number;
  halfmoveClock: number;
  hashLo: number;
  hashHi: number;
}

/** Full board state with reversible make/unmake and legal move generation. */
export class Position {
  readonly board = new Int8Array(128);
  sideToMove: Color = WHITE;
  castling = 0;
  /** Square a pawn could be captured on en passant, or NO_SQUARE. Only set when a capture is possible. */
  epSquare = NO_SQUARE;
  halfmoveClock = 0;
  fullmoveNumber = 1;
  hashLo = 0;
  hashHi = 0;
  private readonly kingSquare = new Int8Array(2);

  static fromFen(fen: string): Position {
    const fields = fen.trim().split(/\s+/);
    if (fields.length < 4) {
      throw new Error("FEN needs at least four fields");
    }
    const [placement, side, castling, ep, halfmove = "0", fullmove = "1"] = fields as [
      string,
      string,
      string,
      string,
      string?,
      string?,
    ];
    const pos = new Position();
    const ranks = placement.split("/");
    if (ranks.length !== 8) {
      throw new Error("FEN placement must have eight ranks");
    }
    ranks.forEach((rankText, i) => {
      const rank = 7 - i;
      let file = 0;
      for (const char of rankText) {
        if (char >= "1" && char <= "8") {
          file += Number(char);
        } else {
          if (file > 7) {
            throw new Error(`Too many squares on rank ${rank + 1}`);
          }
          pos.board[squareOf(file, rank)] = pieceFromChar(char);
          file++;
        }
      }
      if (file !== 8) {
        throw new Error(`Rank ${rank + 1} does not describe eight squares`);
      }
    });

    if (side !== "w" && side !== "b") {
      throw new Error("Side to move must be w or b");
    }
    pos.sideToMove = side === "w" ? WHITE : BLACK;

    if (!/^(-|K?Q?k?q?)$/.test(castling)) {
      throw new Error("Bad castling field");
    }
    if (castling.includes("K")) pos.castling |= CASTLE_WK;
    if (castling.includes("Q")) pos.castling |= CASTLE_WQ;
    if (castling.includes("k")) pos.castling |= CASTLE_BK;
    if (castling.includes("q")) pos.castling |= CASTLE_BQ;

    if (ep !== "-") {
      if (!/^[a-h][36]$/.test(ep)) {
        throw new Error("Bad en passant field");
      }
      const square = squareFromName(ep);
      pos.epSquare = pos.canCaptureEnPassant(square) ? square : NO_SQUARE;
    }

    pos.halfmoveClock = Number(halfmove);
    pos.fullmoveNumber = Number(fullmove);
    if (!Number.isInteger(pos.halfmoveClock) || !Number.isInteger(pos.fullmoveNumber)) {
      throw new Error("Move counters must be integers");
    }

    pos.kingSquare[WHITE] = NO_SQUARE;
    pos.kingSquare[BLACK] = NO_SQUARE;
    let whiteKings = 0;
    let blackKings = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (!isOnBoard(sq)) continue;
      const piece = pos.board[sq] as number;
      if (typeOf(piece) === KING) {
        if (colorOf(piece) === WHITE) whiteKings++;
        else blackKings++;
        pos.kingSquare[colorOf(piece)] = sq;
      }
      if (typeOf(piece) === PAWN && (rankOf(sq) === 0 || rankOf(sq) === 7)) {
        throw new Error("Pawns cannot stand on the first or last rank");
      }
    }
    if (whiteKings !== 1 || blackKings !== 1) {
      throw new Error("Each side needs exactly one king");
    }
    if (pos.isSquareAttacked(pos.kingSquare[pos.sideToMove ^ 1] as number, pos.sideToMove)) {
      throw new Error("The side not to move is in check");
    }
    pos.recomputeHash();
    return pos;
  }

  toFen(): string {
    const rows: string[] = [];
    for (let rank = 7; rank >= 0; rank--) {
      let row = "";
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const piece = this.board[squareOf(file, rank)] as number;
        if (piece === EMPTY) {
          empty++;
        } else {
          if (empty) row += empty;
          empty = 0;
          row += pieceToChar(piece);
        }
      }
      if (empty) row += empty;
      rows.push(row);
    }
    let castling = "";
    if (this.castling & CASTLE_WK) castling += "K";
    if (this.castling & CASTLE_WQ) castling += "Q";
    if (this.castling & CASTLE_BK) castling += "k";
    if (this.castling & CASTLE_BQ) castling += "q";
    const ep = this.epSquare === NO_SQUARE ? "-" : squareToName(this.epSquare);
    return `${rows.join("/")} ${this.sideToMove === WHITE ? "w" : "b"} ${castling || "-"} ${ep} ${this.halfmoveClock} ${this.fullmoveNumber}`;
  }

  clone(): Position {
    const copy = new Position();
    copy.board.set(this.board);
    copy.sideToMove = this.sideToMove;
    copy.castling = this.castling;
    copy.epSquare = this.epSquare;
    copy.halfmoveClock = this.halfmoveClock;
    copy.fullmoveNumber = this.fullmoveNumber;
    copy.hashLo = this.hashLo;
    copy.hashHi = this.hashHi;
    copy.kingSquare.set(this.kingSquare);
    return copy;
  }

  get hash(): number {
    return combineHash(this.hashLo, this.hashHi);
  }

  pieceAt(square: number): number {
    return this.board[square] as number;
  }

  kingOf(color: Color): number {
    return this.kingSquare[color] as number;
  }

  inCheck(): boolean {
    return this.isSquareAttacked(this.kingSquare[this.sideToMove] as number, (this.sideToMove ^ 1) as Color);
  }

  /** True when a piece of `by` attacks `square`. */
  isSquareAttacked(square: number, by: Color): boolean {
    const board = this.board;
    const pawnDirection = by === WHITE ? -16 : 16;
    const pawn = pieceOf(PAWN, by);
    for (const side of [-1, 1]) {
      const from = square + pawnDirection + side;
      if (isOnBoard(from) && board[from] === pawn) return true;
    }
    const knight = pieceOf(KNIGHT, by);
    for (const delta of KNIGHT_DELTAS) {
      const from = square + delta;
      if (isOnBoard(from) && board[from] === knight) return true;
    }
    const king = pieceOf(KING, by);
    for (const delta of KING_DELTAS) {
      const from = square + delta;
      if (isOnBoard(from) && board[from] === king) return true;
    }
    const bishop = pieceOf(BISHOP, by);
    const rook = pieceOf(ROOK, by);
    const queen = pieceOf(QUEEN, by);
    for (const delta of BISHOP_DELTAS) {
      for (let from = square + delta; isOnBoard(from); from += delta) {
        const piece = board[from] as number;
        if (piece === EMPTY) continue;
        if (piece === bishop || piece === queen) return true;
        break;
      }
    }
    for (const delta of ROOK_DELTAS) {
      for (let from = square + delta; isOnBoard(from); from += delta) {
        const piece = board[from] as number;
        if (piece === EMPTY) continue;
        if (piece === rook || piece === queen) return true;
        break;
      }
    }
    return false;
  }

  /** Every move that follows the rules, including check avoidance. */
  legalMoves(): Move[] {
    const legal: Move[] = [];
    for (const move of this.pseudoLegalMoves()) {
      const undo = this.makeMove(move);
      const mover = (this.sideToMove ^ 1) as Color;
      if (!this.isSquareAttacked(this.kingSquare[mover] as number, this.sideToMove)) {
        legal.push(move);
      }
      this.unmakeMove(move, undo);
    }
    return legal;
  }

  /** Moves that follow piece movement but may leave the king in check. */
  pseudoLegalMoves(): Move[] {
    const moves: Move[] = [];
    const us = this.sideToMove;
    const them = (us ^ 1) as Color;
    const board = this.board;
    const forward = us === WHITE ? 16 : -16;
    const startRank = us === WHITE ? 1 : 6;
    const promotionRank = us === WHITE ? 7 : 0;

    for (let from = 0; from < 128; from++) {
      if (!isOnBoard(from)) continue;
      const piece = board[from] as number;
      if (piece === EMPTY || colorOf(piece) !== us) continue;
      const type = typeOf(piece);

      if (type === PAWN) {
        const oneUp = from + forward;
        if (board[oneUp] === EMPTY) {
          this.pushPawnMove(moves, from, oneUp, piece, EMPTY, promotionRank, 0);
          const twoUp = oneUp + forward;
          if (rankOf(from) === startRank && board[twoUp] === EMPTY) {
            moves.push(encodeMove(from, twoUp, piece, EMPTY, 0, FLAG_DOUBLE_PUSH));
          }
        }
        for (const side of [-1, 1]) {
          const to = oneUp + side;
          if (!isOnBoard(to)) continue;
          const target = board[to] as number;
          if (target !== EMPTY && colorOf(target) === them) {
            this.pushPawnMove(moves, from, to, piece, target, promotionRank, 0);
          } else if (to === this.epSquare) {
            moves.push(encodeMove(from, to, piece, pieceOf(PAWN, them), 0, FLAG_EN_PASSANT));
          }
        }
        continue;
      }

      if (type === KNIGHT || type === KING) {
        const deltas = type === KNIGHT ? KNIGHT_DELTAS : KING_DELTAS;
        for (const delta of deltas) {
          const to = from + delta;
          if (!isOnBoard(to)) continue;
          const target = board[to] as number;
          if (target === EMPTY || colorOf(target) === them) {
            moves.push(encodeMove(from, to, piece, target, 0, 0));
          }
        }
        if (type === KING) this.pushCastlingMoves(moves, from, piece);
        continue;
      }

      const deltas = type === BISHOP ? BISHOP_DELTAS : type === ROOK ? ROOK_DELTAS : KING_DELTAS;
      for (const delta of deltas) {
        for (let to = from + delta; isOnBoard(to); to += delta) {
          const target = board[to] as number;
          if (target === EMPTY) {
            moves.push(encodeMove(from, to, piece, EMPTY, 0, 0));
            continue;
          }
          if (colorOf(target) === them) {
            moves.push(encodeMove(from, to, piece, target, 0, 0));
          }
          break;
        }
      }
    }
    return moves;
  }

  private pushPawnMove(
    moves: Move[],
    from: number,
    to: number,
    piece: number,
    captured: number,
    promotionRank: number,
    flags: number,
  ): void {
    if (rankOf(to) === promotionRank) {
      for (const promotion of PROMOTION_TYPES) {
        moves.push(encodeMove(from, to, piece, captured, promotion, flags));
      }
    } else {
      moves.push(encodeMove(from, to, piece, captured, 0, flags));
    }
  }

  private pushCastlingMoves(moves: Move[], from: number, king: number): void {
    const us = this.sideToMove;
    const them = (us ^ 1) as Color;
    const home = us === WHITE ? E1 : E8;
    if (from !== home) return;
    const kingSide = us === WHITE ? CASTLE_WK : CASTLE_BK;
    const queenSide = us === WHITE ? CASTLE_WQ : CASTLE_BQ;
    const board = this.board;
    const rook = pieceOf(ROOK, us);

    if (this.castling & kingSide && board[home + 1] === EMPTY && board[home + 2] === EMPTY && board[home + 3] === rook) {
      if (
        !this.isSquareAttacked(home, them) &&
        !this.isSquareAttacked(home + 1, them) &&
        !this.isSquareAttacked(home + 2, them)
      ) {
        moves.push(encodeMove(home, home + 2, king, EMPTY, 0, FLAG_CASTLE));
      }
    }
    if (
      this.castling & queenSide &&
      board[home - 1] === EMPTY &&
      board[home - 2] === EMPTY &&
      board[home - 3] === EMPTY &&
      board[home - 4] === rook
    ) {
      if (
        !this.isSquareAttacked(home, them) &&
        !this.isSquareAttacked(home - 1, them) &&
        !this.isSquareAttacked(home - 2, them)
      ) {
        moves.push(encodeMove(home, home - 2, king, EMPTY, 0, FLAG_CASTLE));
      }
    }
  }

  makeMove(move: Move): Undo {
    const undo: Undo = {
      castling: this.castling,
      epSquare: this.epSquare,
      halfmoveClock: this.halfmoveClock,
      hashLo: this.hashLo,
      hashHi: this.hashHi,
    };
    const from = moveFrom(move);
    const to = moveTo(move);
    const piece = movePiece(move);
    const captured = moveCaptured(move);
    const promotion = movePromotion(move);
    const flags = moveFlags(move);
    const us = this.sideToMove;
    const board = this.board;

    if (this.epSquare !== NO_SQUARE) this.xorKey(epKeyIndex(fileOf(this.epSquare)));
    this.epSquare = NO_SQUARE;

    if (captured !== EMPTY) {
      const captureSquare = flags & FLAG_EN_PASSANT ? to + (us === WHITE ? -16 : 16) : to;
      board[captureSquare] = EMPTY;
      this.xorKey(pieceKeyIndex(captured, captureSquare));
    }

    board[from] = EMPTY;
    this.xorKey(pieceKeyIndex(piece, from));
    const placed = promotion ? pieceOf(promotion, us) : piece;
    board[to] = placed;
    this.xorKey(pieceKeyIndex(placed, to));

    if (flags & FLAG_CASTLE) {
      const rookFrom = to > from ? from + 3 : from - 4;
      const rookTo = to > from ? from + 1 : from - 1;
      const rook = board[rookFrom] as number;
      board[rookFrom] = EMPTY;
      board[rookTo] = rook;
      this.xorKey(pieceKeyIndex(rook, rookFrom));
      this.xorKey(pieceKeyIndex(rook, rookTo));
    }

    if (typeOf(piece) === KING) this.kingSquare[us] = to;

    this.xorKey(castleKeyIndex(this.castling));
    this.castling &= (CASTLE_MASK[from] as number) & (CASTLE_MASK[to] as number);
    this.xorKey(castleKeyIndex(this.castling));

    if (flags & FLAG_DOUBLE_PUSH) {
      const epSquare = from + (us === WHITE ? 16 : -16);
      if (this.canCaptureEnPassant(epSquare)) {
        this.epSquare = epSquare;
        this.xorKey(epKeyIndex(fileOf(epSquare)));
      }
    }

    this.halfmoveClock = typeOf(piece) === PAWN || captured !== EMPTY ? 0 : this.halfmoveClock + 1;
    if (us === BLACK) this.fullmoveNumber++;
    this.sideToMove = (us ^ 1) as Color;
    this.xorKey(sideKeyIndex());
    return undo;
  }

  unmakeMove(move: Move, undo: Undo): void {
    const from = moveFrom(move);
    const to = moveTo(move);
    const piece = movePiece(move);
    const captured = moveCaptured(move);
    const flags = moveFlags(move);
    const board = this.board;

    this.sideToMove = (this.sideToMove ^ 1) as Color;
    const us = this.sideToMove;
    if (us === BLACK) this.fullmoveNumber--;

    board[to] = EMPTY;
    board[from] = piece;
    if (typeOf(piece) === KING) this.kingSquare[us] = from;

    if (flags & FLAG_CASTLE) {
      const rookFrom = to > from ? from + 3 : from - 4;
      const rookTo = to > from ? from + 1 : from - 1;
      board[rookFrom] = board[rookTo] as number;
      board[rookTo] = EMPTY;
    }

    if (captured !== EMPTY) {
      const captureSquare = flags & FLAG_EN_PASSANT ? to + (us === WHITE ? -16 : 16) : to;
      board[captureSquare] = captured;
    }

    this.castling = undo.castling;
    this.epSquare = undo.epSquare;
    this.halfmoveClock = undo.halfmoveClock;
    this.hashLo = undo.hashLo;
    this.hashHi = undo.hashHi;
  }

  /** Whether the side to move could capture en passant onto `epSquare` after the opponent's double push. */
  private canCaptureEnPassant(epSquare: number): boolean {
    const capturer = this.capturerFor(epSquare);
    const pawn = pieceOf(PAWN, capturer);
    const backward = capturer === WHITE ? -16 : 16;
    for (const side of [-1, 1]) {
      const from = epSquare + backward + side;
      if (isOnBoard(from) && this.board[from] === pawn) return true;
    }
    return false;
  }

  /** The colour that captures onto an en passant square is decided by the square's rank. */
  private capturerFor(epSquare: number): Color {
    return rankOf(epSquare) === 5 ? WHITE : BLACK;
  }

  private xorKey(index: number): void {
    this.hashLo ^= keyLo(index);
    this.hashHi ^= keyHi(index);
  }

  private recomputeHash(): void {
    this.hashLo = 0;
    this.hashHi = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (!isOnBoard(sq)) continue;
      const piece = this.board[sq] as number;
      if (piece !== EMPTY) this.xorKey(pieceKeyIndex(piece, sq));
    }
    this.xorKey(castleKeyIndex(this.castling));
    if (this.epSquare !== NO_SQUARE) this.xorKey(epKeyIndex(fileOf(this.epSquare)));
    if (this.sideToMove === BLACK) this.xorKey(sideKeyIndex());
  }
}
