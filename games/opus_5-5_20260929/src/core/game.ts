import {
  BISHOP,
  Color,
  FLAG_CAPTURE,
  FLAG_CASTLE,
  FLAG_EN_PASSANT,
  KING,
  KNIGHT,
  PAWN,
  Position,
  START_FEN,
  WHITE,
  moveFlags,
  moveFrom,
  movePromotion,
  moveTo,
  moveToUci,
  pieceType,
  squareName,
} from "./position";

export type GameResult = "1-0" | "0-1" | "1/2-1/2" | "*";
export type GameEndReason = "checkmate" | "stalemate" | "threefold" | "fifty-move" | "insufficient" | "resignation";

export interface GameStatus {
  result: GameResult;
  reason: GameEndReason | null;
  inCheck: boolean;
}

export interface PlayedMove {
  uci: string;
  san: string;
  /** Packed move as used by Position. */
  move: number;
  color: Color;
  captured: boolean;
}

const SAN_LETTERS = ["", "", "N", "B", "R", "Q", "K"];

/**
 * True when neither side can possibly checkmate: bare kings, a single minor piece,
 * or only bishops that all stand on the same square colour.
 */
export const hasInsufficientMaterial = (position: Position): boolean => {
  let knights = 0;
  let bishopSquareColors = 0;
  let bishops = 0;
  for (let square = 0; square < 128; square++) {
    const piece = position.board[square];
    if ((square & 0x88) !== 0 || !piece) continue;
    const type = pieceType(piece);
    if (type === KING) continue;
    if (type === KNIGHT) knights += 1;
    else if (type === BISHOP) {
      bishops += 1;
      bishopSquareColors |= 1 << (((square >> 4) + (square & 7)) & 1);
    } else return false;
  }
  if (knights + bishops <= 1) return true;
  return knights === 0 && bishopSquareColors !== 3;
};

/**
 * Position identity for repetition under FIDE rules: placement, side, castling rights and
 * the en passant square only when an en passant capture is actually legal.
 */
const repetitionKey = (position: Position, legalMoves: number[]): string => {
  const [placement, side, castling] = position.toFen().split(" ");
  const epLegal = legalMoves.some((move) => (moveFlags(move) & FLAG_EN_PASSANT) !== 0);
  return `${placement} ${side} ${castling} ${epLegal ? position.epSquare : "-"}`;
};

/** Formats a legal move in Standard Algebraic Notation. `position` must be before the move. */
export const toSan = (position: Position, move: number, legalMoves: number[]): string => {
  const from = moveFrom(move);
  const to = moveTo(move);
  const flags = moveFlags(move);
  const type = pieceType(position.board[from]);
  let san: string;
  if (flags & FLAG_CASTLE) {
    san = to > from ? "O-O" : "O-O-O";
  } else if (type === PAWN) {
    san = flags & FLAG_CAPTURE ? `${squareName(from)[0]}x${squareName(to)}` : squareName(to);
    const promotion = movePromotion(move);
    if (promotion) san += `=${SAN_LETTERS[promotion]}`;
  } else {
    const rivals = legalMoves.filter(
      (other) =>
        other !== move &&
        moveTo(other) === to &&
        moveFrom(other) !== from &&
        pieceType(position.board[moveFrom(other)]) === type,
    );
    let disambiguation = "";
    if (rivals.length > 0) {
      const sameFile = rivals.some((other) => (moveFrom(other) & 7) === (from & 7));
      const sameRank = rivals.some((other) => moveFrom(other) >> 4 === from >> 4);
      const name = squareName(from);
      if (!sameFile) disambiguation = name[0];
      else if (!sameRank) disambiguation = name[1];
      else disambiguation = name;
    }
    san = `${SAN_LETTERS[type]}${disambiguation}${flags & FLAG_CAPTURE ? "x" : ""}${squareName(to)}`;
  }
  position.makeMove(move);
  if (position.inCheck()) san += position.legalMoves().length === 0 ? "#" : "+";
  position.unmakeMove();
  return san;
};

/** A game from a starting position: the move record, the live position and the result. */
export class Game {
  readonly startFen: string;
  readonly position: Position;
  readonly moves: PlayedMove[] = [];
  private readonly fens: string[];
  private readonly repetitionKeys: string[];
  private legal: number[];
  private resignedBy: Color | null = null;

  constructor(startFen: string = START_FEN) {
    this.position = Position.fromFen(startFen);
    this.startFen = this.position.toFen();
    this.fens = [this.startFen];
    this.legal = this.position.legalMoves();
    this.repetitionKeys = [repetitionKey(this.position, this.legal)];
  }

  /** Legal moves in the live position (empty once the game is over). */
  legalMoves(): number[] {
    return this.status().result === "*" ? this.legal : [];
  }

  /** Plays a UCI move. Throws when the game is over or the move is illegal. */
  play(uci: string): PlayedMove {
    if (this.status().result !== "*") throw new Error("The game is already over");
    const move = this.legal.find((candidate) => moveToUci(candidate) === uci);
    if (move === undefined) throw new Error(`${uci} is not legal`);
    const played: PlayedMove = {
      uci,
      san: toSan(this.position, move, this.legal),
      move,
      color: this.position.turn,
      captured: (moveFlags(move) & FLAG_CAPTURE) !== 0,
    };
    this.position.makeMove(move);
    this.legal = this.position.legalMoves();
    this.moves.push(played);
    this.fens.push(this.position.toFen());
    this.repetitionKeys.push(repetitionKey(this.position, this.legal));
    return played;
  }

  /** Records that `color` resigned. */
  resign(color: Color): void {
    if (this.status().result !== "*") throw new Error("The game is already over");
    this.resignedBy = color;
  }

  get resignedColor(): Color | null {
    return this.resignedBy;
  }

  /** FEN after `ply` half-moves (0 is the start position). */
  fenAt(ply: number): string {
    const fen = this.fens[ply];
    if (fen === undefined) throw new Error(`No position at ply ${ply}`);
    return fen;
  }

  /** Result, reason and whether the side to move is in check. */
  status(): GameStatus {
    const inCheck = this.position.inCheck();
    if (this.resignedBy !== null) {
      return { result: this.resignedBy === WHITE ? "0-1" : "1-0", reason: "resignation", inCheck };
    }
    if (this.legal.length === 0) {
      if (inCheck) return { result: this.position.turn === WHITE ? "0-1" : "1-0", reason: "checkmate", inCheck };
      return { result: "1/2-1/2", reason: "stalemate", inCheck };
    }
    if (hasInsufficientMaterial(this.position)) return { result: "1/2-1/2", reason: "insufficient", inCheck };
    if (this.position.halfmoveClock >= 100) return { result: "1/2-1/2", reason: "fifty-move", inCheck };
    const current = this.repetitionKeys[this.repetitionKeys.length - 1];
    if (this.repetitionKeys.filter((key) => key === current).length >= 3) {
      return { result: "1/2-1/2", reason: "threefold", inCheck };
    }
    return { result: "*", reason: null, inCheck };
  }
}
