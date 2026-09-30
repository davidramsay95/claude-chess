/**
 * Self-written chess engine core: 0x88 board representation, legal move
 * generation, make/unmake, FEN, SAN, perft and game-status detection.
 *
 * Squares are 0x88 indices: sq = rank * 16 + file, a1 = 0, h8 = 0x77.
 * A square is on the board exactly when (sq & 0x88) === 0.
 */

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const WHITE = 0;
export const BLACK = 1;
export type ColorIndex = typeof WHITE | typeof BLACK;

export const EMPTY = 0;
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

/** Piece encoding: type in bits 0-2, colour in bit 3 (0 white, 1 black). */
const pieceOf = (color: ColorIndex, type: number): number => type | (color << 3);
const typeOf = (piece: number): number => piece & 7;
const colorOf = (piece: number): ColorIndex => ((piece >> 3) & 1) as ColorIndex;

/**
 * Move encoding (packed integer):
 * bits 0-6 from, 7-13 to, 14-16 promotion piece type,
 * bit 17 capture, bit 18 double pawn push, bit 19 en passant, bit 20 castle.
 */
const FLAG_CAPTURE = 1 << 17;
const FLAG_DOUBLE = 1 << 18;
const FLAG_EP = 1 << 19;
const FLAG_CASTLE = 1 << 20;

export const moveFrom = (m: number): number => m & 0x7f;
export const moveTo = (m: number): number => (m >> 7) & 0x7f;
export const movePromo = (m: number): number => (m >> 14) & 7;
export const moveIsCapture = (m: number): boolean => (m & (FLAG_CAPTURE | FLAG_EP)) !== 0;
export const moveIsCastle = (m: number): boolean => (m & FLAG_CASTLE) !== 0;
export const moveIsEnPassant = (m: number): boolean => (m & FLAG_EP) !== 0;

const packMove = (from: number, to: number, promo = 0, flags = 0): number =>
  from | (to << 7) | (promo << 14) | flags;

/** Castling rights bitmask. */
const CASTLE_WK = 1;
const CASTLE_WQ = 2;
const CASTLE_BK = 4;
const CASTLE_BQ = 8;

const KNIGHT_OFFSETS = [31, 33, 14, 18, -31, -33, -14, -18];
const KING_OFFSETS = [15, 16, 17, -1, 1, -15, -16, -17];
const BISHOP_OFFSETS = [15, 17, -15, -17];
const ROOK_OFFSETS = [16, -16, 1, -1];

const PROMOTION_TYPES = [QUEEN, ROOK, BISHOP, KNIGHT];

export type GameStatus =
  | "playing"
  | "checkmate"
  | "stalemate"
  | "draw-fifty"
  | "draw-repetition"
  | "draw-material";

export const fileOf = (sq: number): number => sq & 15;
export const rankOf = (sq: number): number => sq >> 4;

export const squareToAlgebraic = (sq: number): string =>
  String.fromCharCode(97 + fileOf(sq)) + String(rankOf(sq) + 1);

export const algebraicToSquare = (text: string): number => {
  const file = text.charCodeAt(0) - 97;
  const rank = text.charCodeAt(1) - 49;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) {
    throw new Error(`Invalid square: ${text}`);
  }
  return rank * 16 + file;
};

const FEN_PIECES: Record<string, number> = {
  P: pieceOf(WHITE, PAWN),
  N: pieceOf(WHITE, KNIGHT),
  B: pieceOf(WHITE, BISHOP),
  R: pieceOf(WHITE, ROOK),
  Q: pieceOf(WHITE, QUEEN),
  K: pieceOf(WHITE, KING),
  p: pieceOf(BLACK, PAWN),
  n: pieceOf(BLACK, KNIGHT),
  b: pieceOf(BLACK, BISHOP),
  r: pieceOf(BLACK, ROOK),
  q: pieceOf(BLACK, QUEEN),
  k: pieceOf(BLACK, KING)
};

const PIECE_LETTERS = ["", "p", "n", "b", "r", "q", "k"];

const pieceToFenChar = (piece: number): string => {
  const letter = PIECE_LETTERS[typeOf(piece)] ?? "";
  return colorOf(piece) === WHITE ? letter.toUpperCase() : letter;
};

/** Deterministic PRNG so Zobrist tables are identical across contexts. */
const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
};

const rand = mulberry32(0x9e3779b9);
/** [piece 0..15][square 0..127] -> [lo, hi]. */
const ZOBRIST_PIECES_LO = new Uint32Array(16 * 128);
const ZOBRIST_PIECES_HI = new Uint32Array(16 * 128);
for (let i = 0; i < 16 * 128; i++) {
  ZOBRIST_PIECES_LO[i] = rand();
  ZOBRIST_PIECES_HI[i] = rand() & 0x1fffff;
}
const ZOBRIST_CASTLE_LO = new Uint32Array(16);
const ZOBRIST_CASTLE_HI = new Uint32Array(16);
for (let i = 0; i < 16; i++) {
  ZOBRIST_CASTLE_LO[i] = rand();
  ZOBRIST_CASTLE_HI[i] = rand() & 0x1fffff;
}
const ZOBRIST_EP_FILE_LO = new Uint32Array(8);
const ZOBRIST_EP_FILE_HI = new Uint32Array(8);
for (let i = 0; i < 8; i++) {
  ZOBRIST_EP_FILE_LO[i] = rand();
  ZOBRIST_EP_FILE_HI[i] = rand() & 0x1fffff;
}
const ZOBRIST_TURN_LO = rand();
const ZOBRIST_TURN_HI = rand() & 0x1fffff;

interface HistoryEntry {
  move: number;
  captured: number;
  castling: number;
  epSquare: number;
  halfmoveClock: number;
}

export class Board {
  private board = new Int8Array(128);
  private sideToMove: ColorIndex = WHITE;
  private castling = 0;
  private epSquare = -1;
  private halfmoveClock = 0;
  private fullmoveNumber = 1;
  private kingSquares: [number, number] = [-1, -1];
  private history: HistoryEntry[] = [];
  /** Repetition keys of every position since construction, current included. */
  private keyHistory: number[] = [];

  static fromFen(fen: string): Board {
    const board = new Board();
    board.loadFen(fen);
    return board;
  }

  private loadFen(fen: string): void {
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 4 || parts.length > 6) {
      throw new Error("FEN must have 4 to 6 fields");
    }
    const [placement, turn, castling, ep] = parts as [string, string, string, string];
    const halfmove = parts[4] ?? "0";
    const fullmove = parts[5] ?? "1";

    const ranks = placement.split("/");
    if (ranks.length !== 8) {
      throw new Error("FEN board must have 8 ranks");
    }
    this.board.fill(EMPTY);
    this.kingSquares = [-1, -1];
    for (let r = 0; r < 8; r++) {
      const rankText = ranks[7 - r] ?? "";
      let file = 0;
      for (const ch of rankText) {
        if (ch >= "1" && ch <= "8") {
          file += ch.charCodeAt(0) - 48;
        } else {
          const piece = FEN_PIECES[ch];
          if (piece === undefined || file > 7) {
            throw new Error(`Invalid FEN board character: ${ch}`);
          }
          const sq = r * 16 + file;
          this.board[sq] = piece;
          if (typeOf(piece) === KING) {
            this.kingSquares[colorOf(piece)] = sq;
          }
          file++;
        }
      }
      if (file !== 8) {
        throw new Error("FEN rank does not describe 8 files");
      }
    }
    if (this.kingSquares[WHITE] < 0 || this.kingSquares[BLACK] < 0) {
      throw new Error("FEN must contain both kings");
    }

    if (turn !== "w" && turn !== "b") {
      throw new Error("FEN side to move must be w or b");
    }
    this.sideToMove = turn === "w" ? WHITE : BLACK;

    this.castling = 0;
    if (castling !== "-") {
      for (const ch of castling) {
        if (ch === "K") this.castling |= CASTLE_WK;
        else if (ch === "Q") this.castling |= CASTLE_WQ;
        else if (ch === "k") this.castling |= CASTLE_BK;
        else if (ch === "q") this.castling |= CASTLE_BQ;
        else throw new Error(`Invalid castling field: ${castling}`);
      }
    }

    this.epSquare = ep === "-" ? -1 : algebraicToSquare(ep);
    this.halfmoveClock = Number.parseInt(halfmove, 10);
    this.fullmoveNumber = Number.parseInt(fullmove, 10);
    if (Number.isNaN(this.halfmoveClock) || Number.isNaN(this.fullmoveNumber)) {
      throw new Error("FEN clocks must be numbers");
    }
    this.history = [];
    this.keyHistory = [this.computeKey()];
  }

  toFen(): string {
    const rows: string[] = [];
    for (let r = 7; r >= 0; r--) {
      let row = "";
      let empties = 0;
      for (let f = 0; f < 8; f++) {
        const piece = this.board[r * 16 + f] ?? EMPTY;
        if (piece === EMPTY) {
          empties++;
        } else {
          if (empties > 0) {
            row += String(empties);
            empties = 0;
          }
          row += pieceToFenChar(piece);
        }
      }
      if (empties > 0) row += String(empties);
      rows.push(row);
    }
    let castling = "";
    if (this.castling & CASTLE_WK) castling += "K";
    if (this.castling & CASTLE_WQ) castling += "Q";
    if (this.castling & CASTLE_BK) castling += "k";
    if (this.castling & CASTLE_BQ) castling += "q";
    const ep = this.epSquare >= 0 ? squareToAlgebraic(this.epSquare) : "-";
    return [
      rows.join("/"),
      this.sideToMove === WHITE ? "w" : "b",
      castling || "-",
      ep,
      String(this.halfmoveClock),
      String(this.fullmoveNumber)
    ].join(" ");
  }

  turn(): "w" | "b" {
    return this.sideToMove === WHITE ? "w" : "b";
  }

  turnIndex(): ColorIndex {
    return this.sideToMove;
  }

  pieceAt(sq: number): { type: number; color: ColorIndex } | null {
    const piece = this.board[sq] ?? EMPTY;
    if (piece === EMPTY) return null;
    return { type: typeOf(piece), color: colorOf(piece) };
  }

  halfmoves(): number {
    return this.halfmoveClock;
  }

  moveNumber(): number {
    return this.fullmoveNumber;
  }

  isSquareAttacked(sq: number, byColor: ColorIndex): boolean {
    const pawnDir = byColor === WHITE ? -16 : 16;
    for (const side of [-1, 1]) {
      const from = sq + pawnDir + side;
      if ((from & 0x88) === 0 && this.board[from] === pieceOf(byColor, PAWN)) {
        return true;
      }
    }
    for (const offset of KNIGHT_OFFSETS) {
      const from = sq + offset;
      if ((from & 0x88) === 0 && this.board[from] === pieceOf(byColor, KNIGHT)) {
        return true;
      }
    }
    for (const offset of KING_OFFSETS) {
      const from = sq + offset;
      if ((from & 0x88) === 0 && this.board[from] === pieceOf(byColor, KING)) {
        return true;
      }
    }
    for (const offset of BISHOP_OFFSETS) {
      let from = sq + offset;
      while ((from & 0x88) === 0) {
        const piece = this.board[from] ?? EMPTY;
        if (piece !== EMPTY) {
          if (
            colorOf(piece) === byColor &&
            (typeOf(piece) === BISHOP || typeOf(piece) === QUEEN)
          ) {
            return true;
          }
          break;
        }
        from += offset;
      }
    }
    for (const offset of ROOK_OFFSETS) {
      let from = sq + offset;
      while ((from & 0x88) === 0) {
        const piece = this.board[from] ?? EMPTY;
        if (piece !== EMPTY) {
          if (
            colorOf(piece) === byColor &&
            (typeOf(piece) === ROOK || typeOf(piece) === QUEEN)
          ) {
            return true;
          }
          break;
        }
        from += offset;
      }
    }
    return false;
  }

  inCheck(): boolean {
    return this.isSquareAttacked(
      this.kingSquares[this.sideToMove],
      (this.sideToMove ^ 1) as ColorIndex
    );
  }

  private pseudoLegalMoves(capturesOnly = false): number[] {
    const moves: number[] = [];
    const us = this.sideToMove;
    const them = (us ^ 1) as ColorIndex;
    const forward = us === WHITE ? 16 : -16;
    const startRank = us === WHITE ? 1 : 6;
    const promoRank = us === WHITE ? 7 : 0;

    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) {
        sq += 7;
        continue;
      }
      const piece = this.board[sq] ?? EMPTY;
      if (piece === EMPTY || colorOf(piece) !== us) continue;
      const type = typeOf(piece);

      if (type === PAWN) {
        const oneUp = sq + forward;
        if (!capturesOnly && (oneUp & 0x88) === 0 && this.board[oneUp] === EMPTY) {
          if (rankOf(oneUp) === promoRank) {
            for (const promo of PROMOTION_TYPES) {
              moves.push(packMove(sq, oneUp, promo));
            }
          } else {
            moves.push(packMove(sq, oneUp));
            const twoUp = oneUp + forward;
            if (rankOf(sq) === startRank && this.board[twoUp] === EMPTY) {
              moves.push(packMove(sq, twoUp, 0, FLAG_DOUBLE));
            }
          }
        }
        for (const side of [-1, 1]) {
          const target = sq + forward + side;
          if (target & 0x88) continue;
          const targetPiece = this.board[target] ?? EMPTY;
          if (targetPiece !== EMPTY && colorOf(targetPiece) === them) {
            if (rankOf(target) === promoRank) {
              for (const promo of PROMOTION_TYPES) {
                moves.push(packMove(sq, target, promo, FLAG_CAPTURE));
              }
            } else {
              moves.push(packMove(sq, target, 0, FLAG_CAPTURE));
            }
          } else if (target === this.epSquare) {
            moves.push(packMove(sq, target, 0, FLAG_EP));
          }
        }
        continue;
      }

      if (type === KNIGHT || type === KING) {
        const offsets = type === KNIGHT ? KNIGHT_OFFSETS : KING_OFFSETS;
        for (const offset of offsets) {
          const target = sq + offset;
          if (target & 0x88) continue;
          const targetPiece = this.board[target] ?? EMPTY;
          if (targetPiece === EMPTY) {
            if (!capturesOnly) moves.push(packMove(sq, target));
          } else if (colorOf(targetPiece) === them) {
            moves.push(packMove(sq, target, 0, FLAG_CAPTURE));
          }
        }
        continue;
      }

      const offsets =
        type === BISHOP ? BISHOP_OFFSETS : type === ROOK ? ROOK_OFFSETS : KING_OFFSETS;
      for (const offset of offsets) {
        let target = sq + offset;
        while ((target & 0x88) === 0) {
          const targetPiece = this.board[target] ?? EMPTY;
          if (targetPiece === EMPTY) {
            if (!capturesOnly) moves.push(packMove(sq, target));
          } else {
            if (colorOf(targetPiece) === them) {
              moves.push(packMove(sq, target, 0, FLAG_CAPTURE));
            }
            break;
          }
          target += offset;
        }
      }
    }

    if (!capturesOnly) {
      this.addCastlingMoves(moves);
    }
    return moves;
  }

  private addCastlingMoves(moves: number[]): void {
    const us = this.sideToMove;
    const them = (us ^ 1) as ColorIndex;
    const kingSq = this.kingSquares[us];
    const home = us === WHITE ? 0 : 0x70;
    if (kingSq !== home + 4) return;
    if (this.isSquareAttacked(kingSq, them)) return;

    const kingSide = us === WHITE ? CASTLE_WK : CASTLE_BK;
    const queenSide = us === WHITE ? CASTLE_WQ : CASTLE_BQ;

    if (
      this.castling & kingSide &&
      this.board[home + 5] === EMPTY &&
      this.board[home + 6] === EMPTY &&
      this.board[home + 7] === pieceOf(us, ROOK) &&
      !this.isSquareAttacked(home + 5, them) &&
      !this.isSquareAttacked(home + 6, them)
    ) {
      moves.push(packMove(kingSq, home + 6, 0, FLAG_CASTLE));
    }
    if (
      this.castling & queenSide &&
      this.board[home + 3] === EMPTY &&
      this.board[home + 2] === EMPTY &&
      this.board[home + 1] === EMPTY &&
      this.board[home] === pieceOf(us, ROOK) &&
      !this.isSquareAttacked(home + 3, them) &&
      !this.isSquareAttacked(home + 2, them)
    ) {
      moves.push(packMove(kingSq, home + 2, 0, FLAG_CASTLE));
    }
  }

  legalMoves(): number[] {
    return this.filterLegal(this.pseudoLegalMoves());
  }

  legalCaptures(): number[] {
    return this.filterLegal(this.pseudoLegalMoves(true));
  }

  private filterLegal(moves: number[]): number[] {
    const us = this.sideToMove;
    const them = (us ^ 1) as ColorIndex;
    const legal: number[] = [];
    for (const move of moves) {
      this.makeMove(move);
      if (!this.isSquareAttacked(this.kingSquares[us], them)) {
        legal.push(move);
      }
      this.undoMove();
    }
    return legal;
  }

  makeMove(move: number): void {
    const from = moveFrom(move);
    const to = moveTo(move);
    const us = this.sideToMove;
    const piece = this.board[from] ?? EMPTY;
    let captured = this.board[to] ?? EMPTY;

    this.history.push({
      move,
      captured,
      castling: this.castling,
      epSquare: this.epSquare,
      halfmoveClock: this.halfmoveClock
    });

    this.board[from] = EMPTY;
    this.board[to] = piece;

    if (move & FLAG_EP) {
      const capturedSq = to + (us === WHITE ? -16 : 16);
      captured = this.board[capturedSq] ?? EMPTY;
      this.board[capturedSq] = EMPTY;
      const entry = this.history[this.history.length - 1];
      if (entry) entry.captured = captured;
    }

    if (move & FLAG_CASTLE) {
      const home = us === WHITE ? 0 : 0x70;
      if (to === home + 6) {
        this.board[home + 5] = this.board[home + 7] ?? EMPTY;
        this.board[home + 7] = EMPTY;
      } else {
        this.board[home + 3] = this.board[home] ?? EMPTY;
        this.board[home] = EMPTY;
      }
    }

    const promo = movePromo(move);
    if (promo !== 0) {
      this.board[to] = pieceOf(us, promo);
    }

    if (typeOf(piece) === KING) {
      this.kingSquares[us] = to;
      this.castling &= us === WHITE ? ~(CASTLE_WK | CASTLE_WQ) : ~(CASTLE_BK | CASTLE_BQ);
    }
    // Rook moves or rook captures void the matching castling right.
    for (const [sq, right] of [
      [0x00, CASTLE_WQ],
      [0x07, CASTLE_WK],
      [0x70, CASTLE_BQ],
      [0x77, CASTLE_BK]
    ] as const) {
      if (from === sq || to === sq) this.castling &= ~right;
    }

    this.epSquare = move & FLAG_DOUBLE ? from + (us === WHITE ? 16 : -16) : -1;

    if (typeOf(piece) === PAWN || captured !== EMPTY) {
      this.halfmoveClock = 0;
    } else {
      this.halfmoveClock++;
    }
    if (us === BLACK) this.fullmoveNumber++;
    this.sideToMove = (us ^ 1) as ColorIndex;
    this.keyHistory.push(this.computeKey());
  }

  undoMove(): void {
    const entry = this.history.pop();
    if (!entry) throw new Error("No move to undo");
    this.keyHistory.pop();
    const { move, captured, castling, epSquare, halfmoveClock } = entry;
    const from = moveFrom(move);
    const to = moveTo(move);
    const us = (this.sideToMove ^ 1) as ColorIndex;

    let piece = this.board[to] ?? EMPTY;
    if (movePromo(move) !== 0) {
      piece = pieceOf(us, PAWN);
    }
    this.board[from] = piece;
    this.board[to] = EMPTY;

    if (move & FLAG_EP) {
      this.board[to + (us === WHITE ? -16 : 16)] = captured;
    } else if (captured !== EMPTY) {
      this.board[to] = captured;
    }

    if (move & FLAG_CASTLE) {
      const home = us === WHITE ? 0 : 0x70;
      if (to === home + 6) {
        this.board[home + 7] = this.board[home + 5] ?? EMPTY;
        this.board[home + 5] = EMPTY;
      } else {
        this.board[home] = this.board[home + 3] ?? EMPTY;
        this.board[home + 3] = EMPTY;
      }
    }

    if (typeOf(piece) === KING) {
      this.kingSquares[us] = from;
    }
    this.castling = castling;
    this.epSquare = epSquare;
    this.halfmoveClock = halfmoveClock;
    if (us === BLACK) this.fullmoveNumber--;
    this.sideToMove = us;
  }

  /**
   * Position key for repetition detection and search transposition.
   * The en passant file only enters the key when a capture is actually
   * possible, matching the FIDE definition of "same position".
   */
  private computeKey(): number {
    let lo = 0;
    let hi = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) {
        sq += 7;
        continue;
      }
      const piece = this.board[sq] ?? EMPTY;
      if (piece === EMPTY) continue;
      const index = piece * 128 + sq;
      lo ^= ZOBRIST_PIECES_LO[index] ?? 0;
      hi ^= ZOBRIST_PIECES_HI[index] ?? 0;
    }
    lo ^= ZOBRIST_CASTLE_LO[this.castling] ?? 0;
    hi ^= ZOBRIST_CASTLE_HI[this.castling] ?? 0;
    if (this.epSquare >= 0 && this.epCaptureIsPossible()) {
      const file = fileOf(this.epSquare);
      lo ^= ZOBRIST_EP_FILE_LO[file] ?? 0;
      hi ^= ZOBRIST_EP_FILE_HI[file] ?? 0;
    }
    if (this.sideToMove === BLACK) {
      lo ^= ZOBRIST_TURN_LO;
      hi ^= ZOBRIST_TURN_HI;
    }
    return (lo >>> 0) + hi * 4294967296;
  }

  private epCaptureIsPossible(): boolean {
    const us = this.sideToMove;
    const behind = this.epSquare + (us === WHITE ? -16 : 16);
    for (const side of [-1, 1]) {
      const from = behind + side;
      if ((from & 0x88) === 0 && this.board[from] === pieceOf(us, PAWN)) {
        const move = packMove(from, this.epSquare, 0, FLAG_EP);
        this.makeMove(move);
        const legal = !this.isSquareAttacked(
          this.kingSquares[us],
          (us ^ 1) as ColorIndex
        );
        this.undoMove();
        if (legal) return true;
      }
    }
    return false;
  }

  key(): number {
    return this.keyHistory[this.keyHistory.length - 1] ?? 0;
  }

  /** Number of moves made since construction; used to unwind aborted searches. */
  historyDepth(): number {
    return this.history.length;
  }

  /** Iterates every piece on the board, for evaluation. */
  forEachPiece(fn: (sq: number, type: number, color: ColorIndex) => void): void {
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) {
        sq += 7;
        continue;
      }
      const piece = this.board[sq] ?? EMPTY;
      if (piece !== EMPTY) {
        fn(sq, typeOf(piece), colorOf(piece));
      }
    }
  }

  repetitionCount(): number {
    const current = this.key();
    let count = 0;
    for (const key of this.keyHistory) {
      if (key === current) count++;
    }
    return count;
  }

  hasInsufficientMaterial(): boolean {
    const minorSquares: number[] = [];
    let minorCount = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) {
        sq += 7;
        continue;
      }
      const piece = this.board[sq] ?? EMPTY;
      if (piece === EMPTY) continue;
      const type = typeOf(piece);
      if (type === KING) continue;
      if (type === PAWN || type === ROOK || type === QUEEN) return false;
      minorCount++;
      if (type === BISHOP) minorSquares.push(sq);
    }
    if (minorCount <= 1) return true;
    // Two or more minors: only drawn when all are same-coloured bishops.
    if (minorSquares.length !== minorCount) return false;
    const shade = (sq: number): number => (fileOf(sq) + rankOf(sq)) & 1;
    const first = minorSquares[0] ?? 0;
    return minorSquares.every((sq) => shade(sq) === shade(first));
  }

  status(): GameStatus {
    if (this.legalMoves().length === 0) {
      return this.inCheck() ? "checkmate" : "stalemate";
    }
    if (this.halfmoveClock >= 100) return "draw-fifty";
    if (this.repetitionCount() >= 3) return "draw-repetition";
    if (this.hasInsufficientMaterial()) return "draw-material";
    return "playing";
  }

  moveToUci(move: number): string {
    const promo = movePromo(move);
    return (
      squareToAlgebraic(moveFrom(move)) +
      squareToAlgebraic(moveTo(move)) +
      (promo !== 0 ? PIECE_LETTERS[promo] : "")
    );
  }

  /** Finds the legal move matching a UCI string, or null. */
  uciToMove(uci: string): number | null {
    for (const move of this.legalMoves()) {
      if (this.moveToUci(move) === uci) return move;
    }
    return null;
  }

  /** Standard algebraic notation for a legal move in the current position. */
  san(move: number): string {
    const from = moveFrom(move);
    const to = moveTo(move);
    const piece = this.board[from] ?? EMPTY;
    const type = typeOf(piece);
    let text: string;

    if (move & FLAG_CASTLE) {
      text = fileOf(to) === 6 ? "O-O" : "O-O-O";
    } else if (type === PAWN) {
      text = moveIsCapture(move)
        ? `${String.fromCharCode(97 + fileOf(from))}x${squareToAlgebraic(to)}`
        : squareToAlgebraic(to);
      const promo = movePromo(move);
      if (promo !== 0) {
        text += `=${(PIECE_LETTERS[promo] ?? "").toUpperCase()}`;
      }
    } else {
      const letter = (PIECE_LETTERS[type] ?? "").toUpperCase();
      let sameFile = false;
      let sameRank = false;
      let ambiguous = false;
      for (const other of this.legalMoves()) {
        if (other === move) continue;
        if (moveTo(other) !== to) continue;
        const otherFrom = moveFrom(other);
        if (typeOf(this.board[otherFrom] ?? EMPTY) !== type) continue;
        ambiguous = true;
        if (fileOf(otherFrom) === fileOf(from)) sameFile = true;
        if (rankOf(otherFrom) === rankOf(from)) sameRank = true;
      }
      let disambiguation = "";
      if (ambiguous) {
        if (!sameFile) disambiguation = String.fromCharCode(97 + fileOf(from));
        else if (!sameRank) disambiguation = String(rankOf(from) + 1);
        else disambiguation = squareToAlgebraic(from);
      }
      text = letter + disambiguation + (moveIsCapture(move) ? "x" : "") + squareToAlgebraic(to);
    }

    this.makeMove(move);
    if (this.inCheck()) {
      text += this.legalMoves().length === 0 ? "#" : "+";
    }
    this.undoMove();
    return text;
  }

  perft(depth: number): number {
    if (depth === 0) return 1;
    const moves = this.legalMoves();
    if (depth === 1) return moves.length;
    let nodes = 0;
    for (const move of moves) {
      this.makeMove(move);
      nodes += this.perft(depth - 1);
      this.undoMove();
    }
    return nodes;
  }
}
