import {
  FLAG_CASTLE,
  FLAG_EN_PASSANT,
  isCapture,
  KING,
  type Move,
  moveFlags,
  moveFrom,
  movePromotion,
  moveTo,
  moveToUci,
  NO_MOVE,
  PAWN,
  parseSquare,
  squareName,
  WHITE,
} from "./move";
import { BOARD_SQUARES, pieceColor, pieceType, Position, START_FEN } from "./position";

export type Side = "w" | "b";
export type PieceSymbol = "p" | "n" | "b" | "r" | "q" | "k";
export type PromotionSymbol = "q" | "r" | "b" | "n";

export interface BoardPiece {
  square: string;
  color: Side;
  type: PieceSymbol;
}

export interface LegalMove {
  from: string;
  to: string;
  uci: string;
  promotion?: PromotionSymbol;
  isCapture: boolean;
}

export interface MoveRecord {
  from: string;
  to: string;
  uci: string;
  san: string;
  color: Side;
  piece: PieceSymbol;
  captured?: PieceSymbol;
  promotion?: PromotionSymbol;
  isCastle: boolean;
  isEnPassant: boolean;
}

export type DrawReason = "stalemate" | "threefold-repetition" | "fifty-move-rule" | "insufficient-material";

export type GameResult =
  | { state: "playing" }
  | { state: "checkmate"; winner: Side }
  | { state: "draw"; reason: DrawReason };

const SYMBOLS: readonly PieceSymbol[] = ["p", "p", "n", "b", "r", "q", "k"];
const SAN_LETTERS = ["", "", "N", "B", "R", "Q", "K"];

const sideOf = (color: number): Side => (color === WHITE ? "w" : "b");
const symbolOf = (piece: number): PieceSymbol => SYMBOLS[pieceType(piece)];

/**
 * Rules-complete chess game for the UI: validates moves, records SAN history and adjudicates results.
 * Draws by repetition and the fifty-move rule are applied automatically, as most online platforms do.
 */
export class ChessGame {
  readonly startFen: string;
  private readonly position: Position;
  private readonly records: MoveRecord[] = [];

  constructor(fen: string = START_FEN) {
    this.position = Position.fromFen(fen);
    this.startFen = this.position.toFen();
  }

  fen(): string {
    return this.position.toFen();
  }

  turn(): Side {
    return sideOf(this.position.turn);
  }

  pieces(): BoardPiece[] {
    return BOARD_SQUARES.flatMap((square) => {
      const piece = this.position.pieceAt(square);
      return piece === 0 ? [] : [{ square: squareName(square), color: sideOf(pieceColor(piece)), type: symbolOf(piece) }];
    });
  }

  legalMovesFrom(square: string): LegalMove[] {
    const from = parseSquare(square);
    return this.position
      .generateLegalMoves()
      .filter((move) => moveFrom(move) === from)
      .map((move) => {
        const promotion = movePromotion(move);
        return {
          from: square,
          to: squareName(moveTo(move)),
          uci: moveToUci(move),
          isCapture: isCapture(move),
          ...(promotion ? { promotion: SYMBOLS[promotion] as PromotionSymbol } : {}),
        };
      });
  }

  /** Plays a move given in UCI notation. Throws when the move is illegal. */
  play(uci: string): MoveRecord {
    const legalMoves = this.position.generateLegalMoves();
    const move = legalMoves.find((candidate) => moveToUci(candidate) === uci) ?? NO_MOVE;
    if (move === NO_MOVE) throw new Error(`Illegal move "${uci}" in position ${this.fen()}`);

    const from = moveFrom(move);
    const to = moveTo(move);
    const flags = moveFlags(move);
    const piece = this.position.pieceAt(from);
    const capturedPiece = flags & FLAG_EN_PASSANT ? this.position.pieceAt(to + (pieceColor(piece) === WHITE ? -16 : 16)) : this.position.pieceAt(to);
    const promotion = movePromotion(move);
    const sanWithoutSuffix = this.sanBody(move, legalMoves);

    this.position.makeMove(move);
    const record: MoveRecord = {
      from: squareName(from),
      to: squareName(to),
      uci,
      san: `${sanWithoutSuffix}${this.checkSuffix()}`,
      color: sideOf(pieceColor(piece)),
      piece: symbolOf(piece),
      isCastle: (flags & FLAG_CASTLE) !== 0,
      isEnPassant: (flags & FLAG_EN_PASSANT) !== 0,
      ...(capturedPiece ? { captured: symbolOf(capturedPiece) } : {}),
      ...(promotion ? { promotion: SYMBOLS[promotion] as PromotionSymbol } : {}),
    };
    this.records.push(record);
    return record;
  }

  history(): readonly MoveRecord[] {
    return this.records;
  }

  inCheck(): boolean {
    return this.position.inCheck();
  }

  checkedKingSquare(): string | null {
    return this.position.inCheck() ? squareName(this.position.kingSquare(this.position.turn)) : null;
  }

  result(): GameResult {
    const hasMoves = this.position.generateLegalMoves().length > 0;
    if (!hasMoves) {
      return this.position.inCheck()
        ? { state: "checkmate", winner: this.position.turn === WHITE ? "b" : "w" }
        : { state: "draw", reason: "stalemate" };
    }
    if (this.position.isInsufficientMaterial()) return { state: "draw", reason: "insufficient-material" };
    if (this.position.repetitionCount() >= 3) return { state: "draw", reason: "threefold-repetition" };
    if (this.position.halfmoveClock >= 100) return { state: "draw", reason: "fifty-move-rule" };
    return { state: "playing" };
  }

  /** SAN without the check/mate suffix, which can only be known after the move is played. */
  private sanBody(move: Move, legalMoves: Move[]): string {
    const flags = moveFlags(move);
    const from = moveFrom(move);
    const to = moveTo(move);
    if (flags & FLAG_CASTLE) return to > from ? "O-O" : "O-O-O";

    const piece = this.position.pieceAt(from);
    const type = pieceType(piece);
    const capture = isCapture(move) ? "x" : "";
    if (type === PAWN) {
      const fromFile = capture ? squareName(from)[0] : "";
      const promotion = movePromotion(move) ? `=${SAN_LETTERS[movePromotion(move)]}` : "";
      return `${fromFile}${capture}${squareName(to)}${promotion}`;
    }
    return `${SAN_LETTERS[type]}${type === KING ? "" : this.disambiguation(move, legalMoves)}${capture}${squareName(to)}`;
  }

  private disambiguation(move: Move, legalMoves: Move[]): string {
    const from = moveFrom(move);
    const piece = this.position.pieceAt(from);
    const rivals = legalMoves.filter(
      (other) => moveTo(other) === moveTo(move) && moveFrom(other) !== from && this.position.pieceAt(moveFrom(other)) === piece,
    );
    if (rivals.length === 0) return "";
    const name = squareName(from);
    const sharesFile = rivals.some((other) => (moveFrom(other) & 7) === (from & 7));
    const sharesRank = rivals.some((other) => moveFrom(other) >> 4 === from >> 4);
    if (!sharesFile) return name[0];
    if (!sharesRank) return name[1];
    return name;
  }

  private checkSuffix(): string {
    if (!this.position.inCheck()) return "";
    return this.position.generateLegalMoves().length === 0 ? "#" : "+";
  }
}

