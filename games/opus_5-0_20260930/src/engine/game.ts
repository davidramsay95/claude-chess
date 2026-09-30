/**
 * The rules layer above {@link Position}: move history, SAN, and every way a
 * game can end. It owns nothing about the interface or the search.
 */

import {
  BISHOP,
  FLAG_CASTLE,
  KING,
  KNIGHT,
  PAWN,
  Position,
  QUEEN,
  ROOK,
  START_FEN,
  WHITE,
  algebraic,
  fileOf,
  moveCaptured,
  moveFlags,
  moveFrom,
  movePromotion,
  moveTo,
  moveToUci,
  rankOf,
  squareFromAlgebraic,
} from "./position.ts";

export type GameResult = "1-0" | "0-1" | "1/2-1/2" | "*";
export type Side = "white" | "black";

export interface MoveRecord {
  /** Long algebraic, e.g. `e2e4` or `e7e8q`. */
  uci: string;
  /** Standard algebraic, e.g. `exd5+`. */
  san: string;
  /** Position after the move. */
  fenAfter: string;
  /** Packed move, for replay without re-parsing. */
  move: number;
}

export interface GameStatus {
  over: boolean;
  result: GameResult;
  /** Empty while the game is running. */
  reason: string;
}

const SAN_LETTERS: Record<number, string> = {
  [KNIGHT]: "N",
  [BISHOP]: "B",
  [ROOK]: "R",
  [QUEEN]: "Q",
  [KING]: "K",
};
const PROMOTION_LETTERS: Record<string, number> = { q: QUEEN, r: ROOK, b: BISHOP, n: KNIGHT };

export class Game {
  readonly startFen: string;
  /** Whose move it is in the starting position, cached for the move list. */
  readonly startTurn: Side;
  readonly startMoveNumber: number;
  readonly position: Position;
  readonly moves: MoveRecord[] = [];
  private readonly keys: string[];
  /** Zobrist halves, interleaved hi/lo, for the search's repetition detection. */
  private readonly hashes: number[];
  private resignedBy: Side | null = null;

  constructor(startFen: string = START_FEN) {
    this.startFen = startFen;
    this.position = Position.fromFen(startFen);
    this.startTurn = this.position.turn === WHITE ? "white" : "black";
    this.startMoveNumber = this.position.fullmoveNumber;
    this.keys = [this.position.key()];
    this.hashes = [this.position.hashHi, this.position.hashLo];
  }

  hashHistory(): readonly number[] {
    return this.hashes;
  }

  sideToMove(): Side {
    return this.position.turn === WHITE ? "white" : "black";
  }

  legalMoveUcis(): string[] {
    return this.position.legalMoves().map(moveToUci);
  }

  uciMoves(): string[] {
    return this.moves.map((record) => record.uci);
  }

  /** Move number shown beside half-move `index` in the move list. */
  moveNumberAt(index: number): number {
    const offset = this.startTurn === "black" ? 1 : 0;
    return this.startMoveNumber + Math.floor((index + offset) / 2);
  }

  /** True when half-move `index` was played by White. */
  isWhiteMove(index: number): boolean {
    return this.startTurn === "white" ? index % 2 === 0 : index % 2 === 1;
  }

  findMoveByUci(uci: string): number | null {
    if (uci.length < 4 || uci.length > 5) return null;
    const from = squareFromAlgebraic(uci.slice(0, 2));
    const to = squareFromAlgebraic(uci.slice(2, 4));
    if (from === -1 || to === -1) return null;
    const promotion = uci.length === 5 ? PROMOTION_LETTERS[uci[4]] : undefined;
    if (uci.length === 5 && promotion === undefined) return null;
    for (const move of this.position.legalMoves()) {
      if (moveFrom(move) !== from || moveTo(move) !== to) continue;
      const movePromo = movePromotion(move);
      if (promotion === undefined ? movePromo === 0 : movePromo === promotion) return move;
    }
    return null;
  }

  playUci(uci: string): MoveRecord {
    const move = this.findMoveByUci(uci);
    if (move === null) throw new Error(`${uci} is not a legal move`);
    return this.playMove(move);
  }

  playMove(move: number): MoveRecord {
    const prefix = this.sanPrefix(move);
    this.position.makeMove(move);
    const suffix = this.position.isCheck()
      ? this.position.legalMoves().length === 0
        ? "#"
        : "+"
      : "";
    this.keys.push(this.position.key());
    this.hashes.push(this.position.hashHi, this.position.hashLo);
    const record: MoveRecord = {
      uci: moveToUci(move),
      san: prefix + suffix,
      fenAfter: this.position.toFen(),
      move,
    };
    this.moves.push(record);
    return record;
  }

  undo(): MoveRecord | null {
    const record = this.moves.pop();
    if (!record) return null;
    this.position.unmakeMove();
    this.keys.pop();
    this.hashes.length -= 2;
    this.resignedBy = null;
    return record;
  }

  resign(side: Side): void {
    this.resignedBy = side;
  }

  get resigned(): boolean {
    return this.resignedBy !== null;
  }

  /** SAN without the check or mate suffix, computed before the move is made. */
  private sanPrefix(move: number): string {
    if (this.position.pieceTypeAt(moveFrom(move)) === 0) {
      throw new Error("no piece on the origin square");
    }
    const from = moveFrom(move);
    const to = moveTo(move);
    const type = this.position.pieceTypeAt(from);
    const captured = moveCaptured(move);
    const promotion = movePromotion(move);

    if (moveFlags(move) & FLAG_CASTLE) return to > from ? "O-O" : "O-O-O";

    if (type === PAWN) {
      const body = captured
        ? `${String.fromCharCode(97 + fileOf(from))}x${algebraic(to)}`
        : algebraic(to);
      return promotion ? `${body}=${SAN_LETTERS[promotion]}` : body;
    }

    let disambiguation = "";
    if (type !== KING) {
      const rivals = this.position
        .legalMoves()
        .filter(
          (other) =>
            other !== move &&
            moveTo(other) === to &&
            this.position.pieceTypeAt(moveFrom(other)) === type,
        )
        .map(moveFrom);
      if (rivals.length > 0) {
        const sharesFile = rivals.some((square) => fileOf(square) === fileOf(from));
        const sharesRank = rivals.some((square) => rankOf(square) === rankOf(from));
        if (!sharesFile) disambiguation = String.fromCharCode(97 + fileOf(from));
        else if (!sharesRank) disambiguation = String(rankOf(from) + 1);
        else disambiguation = algebraic(from);
      }
    }
    return `${SAN_LETTERS[type]}${disambiguation}${captured ? "x" : ""}${algebraic(to)}`;
  }

  /** How many times the current position has occurred in this game. */
  repetitionCount(): number {
    const current = this.keys[this.keys.length - 1];
    let count = 0;
    for (const key of this.keys) if (key === current) count++;
    return count;
  }

  isInsufficientMaterial(): boolean {
    let knights = 0;
    let bishops = 0;
    const bishopSquareColours = new Set<number>();
    for (let square = 0; square < 128; square++) {
      if (square & 0x88) continue;
      const type = this.position.pieceTypeAt(square);
      if (type === 0 || type === KING) continue;
      if (type === PAWN || type === ROOK || type === QUEEN) return false;
      if (type === KNIGHT) knights++;
      else {
        bishops++;
        bishopSquareColours.add((fileOf(square) + rankOf(square)) & 1);
      }
    }
    if (knights === 0) return bishopSquareColours.size <= 1;
    return knights === 1 && bishops === 0;
  }

  status(): GameStatus {
    if (this.resignedBy) {
      return {
        over: true,
        result: this.resignedBy === "white" ? "0-1" : "1-0",
        reason: "resignation",
      };
    }
    if (this.position.legalMoves().length === 0) {
      if (this.position.isCheck()) {
        return {
          over: true,
          result: this.position.turn === WHITE ? "0-1" : "1-0",
          reason: "checkmate",
        };
      }
      return { over: true, result: "1/2-1/2", reason: "stalemate" };
    }
    if (this.isInsufficientMaterial()) {
      return { over: true, result: "1/2-1/2", reason: "insufficient material" };
    }
    if (this.position.halfmoveClock >= 100) {
      return { over: true, result: "1/2-1/2", reason: "fifty-move rule" };
    }
    if (this.repetitionCount() >= 3) {
      return { over: true, result: "1/2-1/2", reason: "threefold repetition" };
    }
    return { over: false, result: "*", reason: "" };
  }
}
