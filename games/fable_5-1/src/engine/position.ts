import {
  BISHOP,
  BLACK,
  CASTLE_BK,
  CASTLE_BQ,
  CASTLE_WK,
  CASTLE_WQ,
  EMPTY,
  KING,
  KNIGHT,
  NO_SQUARE,
  PAWN,
  PIECE_LETTERS,
  QUEEN,
  ROOK,
  WHITE,
  algebraicToSquare,
  fileOf,
  isOnBoard,
  makePiece,
  opposite,
  pieceColorOf,
  pieceTypeOf,
  rankOf,
  squareOf,
  squareToAlgebraic,
  type Color,
  type Square,
} from "./types";
import {
  FLAG_CAPTURE,
  FLAG_CASTLE,
  FLAG_DOUBLE_PUSH,
  FLAG_EN_PASSANT,
  encodeMove,
  isCastle,
  isEnPassant,
  moveCaptured,
  moveFrom,
  movePromotion,
  moveTo,
  type Move,
} from "./move";
import {
  ZOBRIST_CASTLE_HI,
  ZOBRIST_CASTLE_LO,
  ZOBRIST_EP_HI,
  ZOBRIST_EP_LO,
  ZOBRIST_PIECE_HI,
  ZOBRIST_PIECE_LO,
  ZOBRIST_SIDE_HI,
  ZOBRIST_SIDE_LO,
} from "./zobrist";

const KNIGHT_DELTAS = [-33, -31, -18, -14, 14, 18, 31, 33];
const KING_DELTAS = [-17, -16, -15, -1, 1, 15, 16, 17];
const BISHOP_DELTAS = [-17, -15, 15, 17];
const ROOK_DELTAS = [-16, -1, 1, 16];
const PAWN_PUSH = [16, -16];
const PAWN_CAPTURES = [
  [15, 17],
  [-15, -17],
];
const PROMOTION_TYPES = [QUEEN, ROOK, BISHOP, KNIGHT];

/** Castling rights that survive a move touching each square (king/rook origin squares, rook targets). */
const CASTLE_MASK = new Uint8Array(128).fill(15);
CASTLE_MASK[squareOf(4, 0)] = 15 & ~(CASTLE_WK | CASTLE_WQ);
CASTLE_MASK[squareOf(0, 0)] = 15 & ~CASTLE_WQ;
CASTLE_MASK[squareOf(7, 0)] = 15 & ~CASTLE_WK;
CASTLE_MASK[squareOf(4, 7)] = 15 & ~(CASTLE_BK | CASTLE_BQ);
CASTLE_MASK[squareOf(0, 7)] = 15 & ~CASTLE_BQ;
CASTLE_MASK[squareOf(7, 7)] = 15 & ~CASTLE_BK;

interface UndoRecord {
  move: Move;
  castling: number;
  epSquare: Square;
  halfmoveClock: number;
  hashLo: number;
  hashHi: number;
}

export type GameStatusKind =
  | "ongoing"
  | "checkmate"
  | "stalemate"
  | "insufficient"
  | "fifty-move"
  | "repetition";

export interface GameStatus {
  kind: GameStatusKind;
  /** Set for checkmate only. */
  winner?: "w" | "b";
}

/**
 * A mutable chess position with make/unmake move. The board uses the 0x88 layout so that
 * off-board detection is a single bitwise test. All rules of chess are enforced here:
 * castling, en passant, promotion, check, checkmate, stalemate, the fifty-move rule,
 * threefold repetition and insufficient material.
 */
export class Position {
  static readonly START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  readonly board = new Int8Array(128);
  turn: Color = WHITE;
  castling = 0;
  epSquare: Square = NO_SQUARE;
  halfmoveClock = 0;
  fullmoveNumber = 1;
  hashLo = 0;
  hashHi = 0;
  private readonly kings: [Square, Square] = [NO_SQUARE, NO_SQUARE];
  private readonly undoStack: UndoRecord[] = [];
  /** Hash history of every position reached, used for repetition detection. */
  private readonly hashHistory: number[] = [];

  static fromFen(fen: string): Position {
    const pos = new Position();
    pos.loadFen(fen);
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
    copy.hashLo = this.hashLo;
    copy.hashHi = this.hashHi;
    copy.kings[0] = this.kings[0];
    copy.kings[1] = this.kings[1];
    copy.undoStack.push(...this.undoStack);
    copy.hashHistory.push(...this.hashHistory);
    return copy;
  }

  loadFen(fen: string): void {
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 4) throw new Error(`Bad FEN: ${fen}`);
    this.board.fill(EMPTY);
    this.undoStack.length = 0;
    this.hashHistory.length = 0;
    let rank = 7;
    let file = 0;
    for (const ch of parts[0]) {
      if (ch === "/") {
        rank--;
        file = 0;
      } else if (ch >= "1" && ch <= "8") {
        file += Number(ch);
      } else {
        const type = PIECE_LETTERS.indexOf(ch.toUpperCase());
        if (type <= 0) throw new Error(`Bad FEN piece: ${ch}`);
        const color: Color = ch === ch.toUpperCase() ? WHITE : BLACK;
        const sq = squareOf(file, rank);
        this.board[sq] = makePiece(type, color);
        if (type === KING) this.kings[color] = sq;
        file++;
      }
    }
    this.turn = parts[1] === "b" ? BLACK : WHITE;
    this.castling = 0;
    if (parts[2].includes("K")) this.castling |= CASTLE_WK;
    if (parts[2].includes("Q")) this.castling |= CASTLE_WQ;
    if (parts[2].includes("k")) this.castling |= CASTLE_BK;
    if (parts[2].includes("q")) this.castling |= CASTLE_BQ;
    this.epSquare = parts[3] === "-" ? NO_SQUARE : algebraicToSquare(parts[3]);
    this.halfmoveClock = parts.length > 4 ? Number(parts[4]) : 0;
    this.fullmoveNumber = parts.length > 5 ? Number(parts[5]) : 1;
    this.recomputeHash();
    this.hashHistory.push(this.hashKey());
  }

  toFen(): string {
    const rows: string[] = [];
    for (let rank = 7; rank >= 0; rank--) {
      let row = "";
      let empties = 0;
      for (let file = 0; file < 8; file++) {
        const piece = this.board[squareOf(file, rank)];
        if (piece === EMPTY) {
          empties++;
          continue;
        }
        if (empties > 0) {
          row += empties;
          empties = 0;
        }
        const letter = PIECE_LETTERS[pieceTypeOf(piece)];
        row += pieceColorOf(piece) === WHITE ? letter : letter.toLowerCase();
      }
      if (empties > 0) row += empties;
      rows.push(row);
    }
    let castle = "";
    if (this.castling & CASTLE_WK) castle += "K";
    if (this.castling & CASTLE_WQ) castle += "Q";
    if (this.castling & CASTLE_BK) castle += "k";
    if (this.castling & CASTLE_BQ) castle += "q";
    const ep = this.epSquare === NO_SQUARE ? "-" : squareToAlgebraic(this.epSquare);
    return `${rows.join("/")} ${this.turn === WHITE ? "w" : "b"} ${castle || "-"} ${ep} ${
      this.halfmoveClock
    } ${this.fullmoveNumber}`;
  }

  pieceAt(sq: Square): number {
    return this.board[sq];
  }

  kingSquare(color: Color): Square {
    return this.kings[color];
  }

  /** A single number combining both hash halves, safe within 2^53. */
  hashKey(): number {
    return this.hashLo * 2097152 + (this.hashHi >>> 11);
  }

  historyLength(): number {
    return this.undoStack.length;
  }

  lastMove(): Move | null {
    const last = this.undoStack[this.undoStack.length - 1];
    return last ? last.move : null;
  }

  isAttacked(sq: Square, by: Color): boolean {
    const board = this.board;
    for (const delta of PAWN_CAPTURES[opposite(by)]) {
      // A pawn of colour `by` attacks `sq` if it sits where a pawn of the other colour would capture from `sq`.
      const from = sq + delta;
      if (isOnBoard(from) && board[from] === makePiece(PAWN, by)) return true;
    }
    for (const delta of KNIGHT_DELTAS) {
      const from = sq + delta;
      if (isOnBoard(from) && board[from] === makePiece(KNIGHT, by)) return true;
    }
    for (const delta of KING_DELTAS) {
      const from = sq + delta;
      if (isOnBoard(from) && board[from] === makePiece(KING, by)) return true;
    }
    if (this.slidingAttack(sq, by, BISHOP_DELTAS, BISHOP)) return true;
    if (this.slidingAttack(sq, by, ROOK_DELTAS, ROOK)) return true;
    return false;
  }

  private slidingAttack(sq: Square, by: Color, deltas: number[], sliderType: number): boolean {
    const board = this.board;
    const slider = makePiece(sliderType, by);
    const queen = makePiece(QUEEN, by);
    for (const delta of deltas) {
      let from = sq + delta;
      while (isOnBoard(from)) {
        const piece = board[from];
        if (piece !== EMPTY) {
          if (piece === slider || piece === queen) return true;
          break;
        }
        from += delta;
      }
    }
    return false;
  }

  inCheck(): boolean {
    return this.isAttacked(this.kings[this.turn], opposite(this.turn));
  }

  /** Generates every legal move for the side to move. */
  legalMoves(): Move[] {
    const pseudo = this.pseudoLegalMoves();
    const legal: Move[] = [];
    const us = this.turn;
    for (const move of pseudo) {
      this.makeMove(move);
      if (!this.isAttacked(this.kings[us], opposite(us))) legal.push(move);
      this.undoMove();
    }
    return legal;
  }

  /** Legal captures and promotions only, for quiescence search. */
  legalTacticalMoves(): Move[] {
    return this.legalMoves().filter((m) => (m & FLAG_CAPTURE) !== 0 || movePromotion(m) !== 0);
  }

  pseudoLegalMoves(): Move[] {
    const moves: Move[] = [];
    const board = this.board;
    const us = this.turn;
    const them = opposite(us);
    for (let sq = 0; sq < 128; sq++) {
      if (!isOnBoard(sq)) {
        sq += 7;
        continue;
      }
      const piece = board[sq];
      if (piece === EMPTY || pieceColorOf(piece) !== us) continue;
      const type = pieceTypeOf(piece);
      switch (type) {
        case PAWN:
          this.generatePawnMoves(sq, us, them, moves);
          break;
        case KNIGHT:
          this.generateStepMoves(sq, KNIGHT_DELTAS, them, moves);
          break;
        case KING:
          this.generateStepMoves(sq, KING_DELTAS, them, moves);
          this.generateCastling(sq, us, them, moves);
          break;
        case BISHOP:
          this.generateSlidingMoves(sq, BISHOP_DELTAS, them, moves);
          break;
        case ROOK:
          this.generateSlidingMoves(sq, ROOK_DELTAS, them, moves);
          break;
        case QUEEN:
          this.generateSlidingMoves(sq, BISHOP_DELTAS, them, moves);
          this.generateSlidingMoves(sq, ROOK_DELTAS, them, moves);
          break;
      }
    }
    return moves;
  }

  private generatePawnMoves(sq: Square, us: Color, them: Color, moves: Move[]): void {
    const board = this.board;
    const push = PAWN_PUSH[us];
    const startRank = us === WHITE ? 1 : 6;
    const promoRank = us === WHITE ? 7 : 0;
    const oneUp = sq + push;
    if (isOnBoard(oneUp) && board[oneUp] === EMPTY) {
      if (rankOf(oneUp) === promoRank) {
        for (const promo of PROMOTION_TYPES) moves.push(encodeMove(sq, oneUp, 0, promo, 0));
      } else {
        moves.push(encodeMove(sq, oneUp, 0, 0, 0));
        const twoUp = oneUp + push;
        if (rankOf(sq) === startRank && board[twoUp] === EMPTY) {
          moves.push(encodeMove(sq, twoUp, 0, 0, FLAG_DOUBLE_PUSH));
        }
      }
    }
    for (const delta of PAWN_CAPTURES[us]) {
      const to = sq + delta;
      if (!isOnBoard(to)) continue;
      const target = board[to];
      if (target !== EMPTY && pieceColorOf(target) === them) {
        const capturedType = pieceTypeOf(target);
        if (rankOf(to) === promoRank) {
          for (const promo of PROMOTION_TYPES) {
            moves.push(encodeMove(sq, to, capturedType, promo, FLAG_CAPTURE));
          }
        } else {
          moves.push(encodeMove(sq, to, capturedType, 0, FLAG_CAPTURE));
        }
      } else if (to === this.epSquare) {
        moves.push(encodeMove(sq, to, PAWN, 0, FLAG_CAPTURE | FLAG_EN_PASSANT));
      }
    }
  }

  private generateStepMoves(sq: Square, deltas: number[], them: Color, moves: Move[]): void {
    const board = this.board;
    for (const delta of deltas) {
      const to = sq + delta;
      if (!isOnBoard(to)) continue;
      const target = board[to];
      if (target === EMPTY) {
        moves.push(encodeMove(sq, to, 0, 0, 0));
      } else if (pieceColorOf(target) === them) {
        moves.push(encodeMove(sq, to, pieceTypeOf(target), 0, FLAG_CAPTURE));
      }
    }
  }

  private generateSlidingMoves(sq: Square, deltas: number[], them: Color, moves: Move[]): void {
    const board = this.board;
    for (const delta of deltas) {
      let to = sq + delta;
      while (isOnBoard(to)) {
        const target = board[to];
        if (target === EMPTY) {
          moves.push(encodeMove(sq, to, 0, 0, 0));
        } else {
          if (pieceColorOf(target) === them) {
            moves.push(encodeMove(sq, to, pieceTypeOf(target), 0, FLAG_CAPTURE));
          }
          break;
        }
        to += delta;
      }
    }
  }

  private generateCastling(sq: Square, us: Color, them: Color, moves: Move[]): void {
    const board = this.board;
    const rank = us === WHITE ? 0 : 7;
    if (sq !== squareOf(4, rank)) return;
    const kingSide = us === WHITE ? CASTLE_WK : CASTLE_BK;
    const queenSide = us === WHITE ? CASTLE_WQ : CASTLE_BQ;
    if (!(this.castling & (kingSide | queenSide))) return;
    if (this.isAttacked(sq, them)) return;
    if (this.castling & kingSide) {
      const f = squareOf(5, rank);
      const g = squareOf(6, rank);
      if (
        board[f] === EMPTY &&
        board[g] === EMPTY &&
        board[squareOf(7, rank)] === makePiece(ROOK, us) &&
        !this.isAttacked(f, them) &&
        !this.isAttacked(g, them)
      ) {
        moves.push(encodeMove(sq, g, 0, 0, FLAG_CASTLE));
      }
    }
    if (this.castling & queenSide) {
      const d = squareOf(3, rank);
      const c = squareOf(2, rank);
      const b = squareOf(1, rank);
      if (
        board[d] === EMPTY &&
        board[c] === EMPTY &&
        board[b] === EMPTY &&
        board[squareOf(0, rank)] === makePiece(ROOK, us) &&
        !this.isAttacked(d, them) &&
        !this.isAttacked(c, them)
      ) {
        moves.push(encodeMove(sq, c, 0, 0, FLAG_CASTLE));
      }
    }
  }

  makeMove(move: Move): void {
    const board = this.board;
    const from = moveFrom(move);
    const to = moveTo(move);
    const us = this.turn;
    const piece = board[from];
    const type = pieceTypeOf(piece);

    this.undoStack.push({
      move,
      castling: this.castling,
      epSquare: this.epSquare,
      halfmoveClock: this.halfmoveClock,
      hashLo: this.hashLo,
      hashHi: this.hashHi,
    });

    if (this.epSquare !== NO_SQUARE) this.hashEp(this.epSquare);
    this.hashCastle(this.castling);

    const captured = moveCaptured(move);
    if (captured !== 0) {
      const capturedSquare = isEnPassant(move) ? to - PAWN_PUSH[us] : to;
      this.hashPiece(board[capturedSquare], capturedSquare);
      board[capturedSquare] = EMPTY;
    }

    this.hashPiece(piece, from);
    board[from] = EMPTY;
    const promotion = movePromotion(move);
    const placed = promotion ? makePiece(promotion, us) : piece;
    board[to] = placed;
    this.hashPiece(placed, to);

    if (type === KING) {
      this.kings[us] = to;
      if (isCastle(move)) {
        const rank = rankOf(from);
        const rookFrom = to > from ? squareOf(7, rank) : squareOf(0, rank);
        const rookTo = to > from ? squareOf(5, rank) : squareOf(3, rank);
        const rook = board[rookFrom];
        this.hashPiece(rook, rookFrom);
        board[rookFrom] = EMPTY;
        board[rookTo] = rook;
        this.hashPiece(rook, rookTo);
      }
    }

    this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
    this.hashCastle(this.castling);

    this.epSquare = (move & FLAG_DOUBLE_PUSH) !== 0 ? from + PAWN_PUSH[us] : NO_SQUARE;
    if (this.epSquare !== NO_SQUARE) this.hashEp(this.epSquare);

    this.halfmoveClock = type === PAWN || captured !== 0 ? 0 : this.halfmoveClock + 1;
    if (us === BLACK) this.fullmoveNumber++;
    this.turn = opposite(us);
    this.hashLo ^= ZOBRIST_SIDE_LO;
    this.hashHi ^= ZOBRIST_SIDE_HI;
    this.hashHistory.push(this.hashKey());
  }

  undoMove(): void {
    const record = this.undoStack.pop();
    if (!record) throw new Error("No move to undo");
    this.hashHistory.pop();
    const board = this.board;
    const move = record.move;
    const from = moveFrom(move);
    const to = moveTo(move);
    const us = opposite(this.turn);
    this.turn = us;
    if (us === BLACK) this.fullmoveNumber--;

    const promotion = movePromotion(move);
    const piece = promotion ? makePiece(PAWN, us) : board[to];
    board[from] = piece;
    board[to] = EMPTY;
    if (pieceTypeOf(piece) === KING) {
      this.kings[us] = from;
      if (isCastle(move)) {
        const rank = rankOf(from);
        const rookFrom = to > from ? squareOf(7, rank) : squareOf(0, rank);
        const rookTo = to > from ? squareOf(5, rank) : squareOf(3, rank);
        board[rookFrom] = board[rookTo];
        board[rookTo] = EMPTY;
      }
    }
    const captured = moveCaptured(move);
    if (captured !== 0) {
      const capturedSquare = isEnPassant(move) ? to - PAWN_PUSH[us] : to;
      board[capturedSquare] = makePiece(captured, opposite(us));
    }

    this.castling = record.castling;
    this.epSquare = record.epSquare;
    this.halfmoveClock = record.halfmoveClock;
    this.hashLo = record.hashLo;
    this.hashHi = record.hashHi;
  }

  /** Number of times the current position has occurred, including now. */
  repetitionCount(): number {
    const key = this.hashKey();
    let count = 0;
    // Positions before the last irreversible move cannot repeat; scan only that far back.
    const limit = Math.max(0, this.hashHistory.length - 1 - this.halfmoveClock);
    for (let i = this.hashHistory.length - 1; i >= limit; i--) {
      if (this.hashHistory[i] === key) count++;
    }
    return count;
  }

  status(): GameStatus {
    if (this.legalMoves().length === 0) {
      if (this.inCheck()) return { kind: "checkmate", winner: this.turn === WHITE ? "b" : "w" };
      return { kind: "stalemate" };
    }
    if (this.halfmoveClock >= 100) return { kind: "fifty-move" };
    if (this.repetitionCount() >= 3) return { kind: "repetition" };
    if (this.hasInsufficientMaterial()) return { kind: "insufficient" };
    return { kind: "ongoing" };
  }

  /**
   * FIDE 5.2.2: a draw when no sequence of legal moves can lead to checkmate.
   * King vs king, king and one minor piece vs king, and any number of bishops
   * that all stand on the same square colour cannot deliver mate.
   */
  hasInsufficientMaterial(): boolean {
    let minors = 0;
    let bishopSquareColor = -1;
    let knights = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (!isOnBoard(sq)) {
        sq += 7;
        continue;
      }
      const piece = this.board[sq];
      if (piece === EMPTY) continue;
      const type = pieceTypeOf(piece);
      if (type === PAWN || type === ROOK || type === QUEEN) return false;
      if (type === KNIGHT) {
        knights++;
        minors++;
      } else if (type === BISHOP) {
        minors++;
        const color = (fileOf(sq) + rankOf(sq)) & 1;
        if (bishopSquareColor === -1) bishopSquareColor = color;
        else if (bishopSquareColor !== color) return false;
      }
    }
    if (minors <= 1) return true;
    return knights === 0;
  }

  private hashPiece(piece: number, sq: Square): void {
    const index = piece * 128 + sq;
    this.hashLo ^= ZOBRIST_PIECE_LO[index];
    this.hashHi ^= ZOBRIST_PIECE_HI[index];
  }

  private hashCastle(rights: number): void {
    this.hashLo ^= ZOBRIST_CASTLE_LO[rights];
    this.hashHi ^= ZOBRIST_CASTLE_HI[rights];
  }

  private hashEp(sq: Square): void {
    this.hashLo ^= ZOBRIST_EP_LO[fileOf(sq)];
    this.hashHi ^= ZOBRIST_EP_HI[fileOf(sq)];
  }

  private recomputeHash(): void {
    this.hashLo = 0;
    this.hashHi = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (!isOnBoard(sq)) {
        sq += 7;
        continue;
      }
      if (this.board[sq] !== EMPTY) this.hashPiece(this.board[sq], sq);
    }
    this.hashCastle(this.castling);
    if (this.epSquare !== NO_SQUARE) this.hashEp(this.epSquare);
    if (this.turn === BLACK) {
      this.hashLo ^= ZOBRIST_SIDE_LO;
      this.hashHi ^= ZOBRIST_SIDE_HI;
    }
  }
}
