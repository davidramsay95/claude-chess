import { type Move, moveFrom, movePromotion, moveTo, moveToUci, parseUci } from "./move";
import { Position, type Undo } from "./position";
import { sanOf } from "./san";
import {
  BISHOP,
  BLACK,
  type Color,
  EMPTY,
  KING,
  KNIGHT,
  START_FEN,
  WHITE,
  fileOf,
  isOnBoard,
  rankOf,
  typeOf,
} from "./types";

export type ColorName = "white" | "black";
export type GameResult = "1-0" | "0-1" | "1/2-1/2" | "*";

export type StatusKind =
  | "playing"
  | "checkmate"
  | "stalemate"
  | "repetition"
  | "fifty-move"
  | "insufficient-material"
  | "resigned";

export interface GameStatus {
  kind: StatusKind;
  inCheck: boolean;
  /** Set when the game is over with a winner. */
  winner?: ColorName;
}

export const colorName = (color: Color): ColorName => (color === WHITE ? "white" : "black");
export const colorFromName = (name: ColorName): Color => (name === "white" ? WHITE : BLACK);

/** A chess game: a start position, the moves played, and the rules that end it. */
export class Game {
  readonly startFen: string;
  readonly position: Position;
  private readonly moves: Move[] = [];
  private readonly undos: Undo[] = [];
  private readonly sans: string[] = [];
  /** Position hashes after each ply, index 0 is the start position. */
  private readonly hashes: number[] = [];
  private resignedBy: Color | null = null;

  private constructor(startFen: string) {
    this.startFen = startFen;
    this.position = Position.fromFen(startFen);
    this.hashes.push(this.position.hash);
  }

  static fromStart(): Game {
    return new Game(START_FEN);
  }

  static fromFen(fen: string): Game {
    return new Game(fen);
  }

  fen(): string {
    return this.position.toFen();
  }

  turn(): Color {
    return this.position.sideToMove;
  }

  plyCount(): number {
    return this.moves.length;
  }

  /** Legal moves, or none once the game is over. */
  legalMoves(): Move[] {
    if (this.resignedBy !== null || this.isDrawByRule()) return [];
    return this.position.legalMoves();
  }

  /** Legal moves from a square, useful for showing targets in the interface. */
  legalMovesFrom(square: number): Move[] {
    return this.legalMoves().filter((move) => moveFrom(move) === square);
  }

  /** Find the legal move matching a UCI string, or NO_MOVE if there is none. */
  findUci(uci: string): Move | null {
    const parts = parseUci(uci);
    if (!parts) return null;
    const match = this.legalMoves().find(
      (move) => moveFrom(move) === parts.from && moveTo(move) === parts.to && movePromotion(move) === parts.promotion,
    );
    return match ?? null;
  }

  playUci(uci: string): boolean {
    const move = this.findUci(uci);
    if (move === null) return false;
    this.playMove(move);
    return true;
  }

  playMove(move: Move): void {
    const legal = this.position.legalMoves();
    this.sans.push(sanOf(this.position, move, legal));
    this.undos.push(this.position.makeMove(move));
    this.moves.push(move);
    this.hashes.push(this.position.hash);
  }

  undo(): boolean {
    const move = this.moves.pop();
    const undo = this.undos.pop();
    if (move === undefined || undo === undefined) return false;
    this.position.unmakeMove(move, undo);
    this.sans.pop();
    this.hashes.pop();
    this.resignedBy = null;
    return true;
  }

  resign(color: ColorName): void {
    if (this.status().kind === "playing") this.resignedBy = colorFromName(color);
  }

  hasResigned(): boolean {
    return this.resignedBy !== null;
  }

  uciHistory(): string[] {
    return this.moves.map(moveToUci);
  }

  sanHistory(): string[] {
    return [...this.sans];
  }

  moveHistory(): Move[] {
    return [...this.moves];
  }

  lastMove(): Move | null {
    return this.moves.length ? (this.moves[this.moves.length - 1] as Move) : null;
  }

  /** The FEN after `ply` half-moves, replayed from the start. */
  fenAt(ply: number): string {
    return this.positionAt(ply).toFen();
  }

  positionAt(ply: number): Position {
    const pos = Position.fromFen(this.startFen);
    for (let i = 0; i < Math.min(ply, this.moves.length); i++) {
      pos.makeMove(this.moves[i] as Move);
    }
    return pos;
  }

  status(): GameStatus {
    const inCheck = this.position.inCheck();
    if (this.resignedBy !== null) {
      return { kind: "resigned", inCheck, winner: colorName((this.resignedBy ^ 1) as Color) };
    }
    if (this.position.legalMoves().length === 0) {
      if (inCheck) {
        return { kind: "checkmate", inCheck, winner: colorName((this.position.sideToMove ^ 1) as Color) };
      }
      return { kind: "stalemate", inCheck };
    }
    if (this.isInsufficientMaterial()) return { kind: "insufficient-material", inCheck };
    if (this.isRepetition()) return { kind: "repetition", inCheck };
    if (this.position.halfmoveClock >= 100) return { kind: "fifty-move", inCheck };
    return { kind: "playing", inCheck };
  }

  result(): GameResult {
    const status = this.status();
    if (status.kind === "playing") return "*";
    if (status.winner === "white") return "1-0";
    if (status.winner === "black") return "0-1";
    return "1/2-1/2";
  }

  isOver(): boolean {
    return this.status().kind !== "playing";
  }

  private isDrawByRule(): boolean {
    return this.isInsufficientMaterial() || this.isRepetition() || this.position.halfmoveClock >= 100;
  }

  private isRepetition(): boolean {
    const current = this.position.hash;
    let count = 0;
    // Only plies since the last irreversible move can repeat the current position.
    const first = this.hashes.length - 1 - this.position.halfmoveClock;
    for (let i = this.hashes.length - 1; i >= Math.max(0, first); i--) {
      if (this.hashes[i] === current) count++;
    }
    return count >= 3;
  }

  private isInsufficientMaterial(): boolean {
    const bishopColors = new Set<number>();
    let minors = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (!isOnBoard(sq)) continue;
      const piece = this.position.pieceAt(sq);
      if (piece === EMPTY) continue;
      const type = typeOf(piece);
      if (type === KING) continue;
      if (type === KNIGHT) {
        minors++;
      } else if (type === BISHOP) {
        minors++;
        bishopColors.add((fileOf(sq) + rankOf(sq)) & 1);
      } else {
        return false;
      }
    }
    if (minors <= 1) return true;
    // Any number of bishops on one square colour cannot deliver mate.
    return bishopColors.size === 1 && minors === this.countBishops();
  }

  private countBishops(): number {
    let count = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (isOnBoard(sq) && typeOf(this.position.pieceAt(sq)) === BISHOP) count++;
    }
    return count;
  }
}
