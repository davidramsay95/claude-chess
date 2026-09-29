import { generateLegalMoves } from './movegen';
import { Position } from './position';
import {
  BISHOP,
  type Color,
  KNIGHT,
  type Move,
  PAWN,
  QUEEN,
  ROOK,
  isCapture,
  isCastle,
  moveFrom,
  movePromotion,
  moveTo,
  pieceKind,
  squareFile,
  squareName,
  squareRank,
} from './types';

export type DrawReason =
  | 'stalemate'
  | 'threefold-repetition'
  | 'fifty-move'
  | 'insufficient-material'
  | 'agreement';

export interface GameStatus {
  state: 'ongoing' | 'checkmate' | 'draw';
  /** Color that delivered mate. Present only for checkmate. */
  winner?: Color;
  reason?: DrawReason;
  /** Whether the side to move is in check. */
  check: boolean;
}

const PIECE_LETTERS = ['', '', 'N', 'B', 'R', 'Q', 'K'];
const PROMOTION_LETTERS: Record<string, number> = { n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN };

/** Rules-aware game: legal move lookup, history, undo, SAN, and end-of-game detection. */
export class Game {
  readonly position: Position;
  readonly moveHistory: Move[] = [];
  readonly sanHistory: string[] = [];

  constructor(position: Position = Position.startPosition()) {
    this.position = position;
  }

  static fromFen(fen: string): Game {
    return new Game(Position.fromFen(fen));
  }

  get turn(): Color {
    return this.position.turn;
  }

  legalMoves(): Move[] {
    return generateLegalMoves(this.position);
  }

  legalMovesFrom(square: number): Move[] {
    return this.legalMoves().filter((move) => moveFrom(move) === square);
  }

  /** Finds the legal move matching coordinates like `e2e4` or `e7e8q`. */
  parseUci(uci: string): Move | undefined {
    if (!/^[a-h][1-8][a-h][1-8][nbrq]?$/.test(uci)) return undefined;
    const from = squareFromName(uci.slice(0, 2));
    const to = squareFromName(uci.slice(2, 4));
    const promotion = uci.length === 5 ? PROMOTION_LETTERS[uci[4]] : 0;
    return this.findMove(from, to, promotion);
  }

  findMove(from: number, to: number, promotion = 0): Move | undefined {
    return this.legalMoves().find(
      (move) => moveFrom(move) === from && moveTo(move) === to && movePromotion(move) === promotion,
    );
  }

  /** Plays a legal move and returns its SAN. The caller must pass a legal move. */
  play(move: Move): string {
    const san = this.toSan(move);
    this.position.makeMove(move);
    this.moveHistory.push(move);
    this.sanHistory.push(san);
    return san;
  }

  undo(): boolean {
    if (this.moveHistory.length === 0) return false;
    this.position.unmakeMove();
    this.moveHistory.pop();
    this.sanHistory.pop();
    return true;
  }

  status(): GameStatus {
    const pos = this.position;
    const check = pos.inCheck();
    if (this.legalMoves().length === 0) {
      return check
        ? { state: 'checkmate', winner: (pos.turn ^ 1) as Color, check }
        : { state: 'draw', reason: 'stalemate', check };
    }
    if (pos.isInsufficientMaterial()) return { state: 'draw', reason: 'insufficient-material', check };
    if (pos.halfmoveClock >= 100) return { state: 'draw', reason: 'fifty-move', check };
    if (pos.repetitionCount() >= 3) return { state: 'draw', reason: 'threefold-repetition', check };
    return { state: 'ongoing', check };
  }

  /** Full SAN including check or mate marker; must be called before the move is made. */
  toSan(move: Move): string {
    const base = this.baseSan(move);
    this.position.makeMove(move);
    const suffix = this.suffixForCheck();
    this.position.unmakeMove();
    return base + suffix;
  }

  private baseSan(move: Move): string {
    const pos = this.position;
    const from = moveFrom(move);
    const to = moveTo(move);
    if (isCastle(move)) return to > from ? 'O-O' : 'O-O-O';

    const kind = pieceKind(pos.board[from]);
    const capture = isCapture(move);
    let san = '';
    if (kind === PAWN) {
      if (capture) san += `${'abcdefgh'[squareFile(from)]}x`;
      san += squareName(to);
      const promotion = movePromotion(move);
      if (promotion) san += `=${PIECE_LETTERS[promotion]}`;
      return san;
    }

    san += PIECE_LETTERS[kind];
    const rivals = this.legalMoves().filter(
      (other) => other !== move && moveTo(other) === to && moveFrom(other) !== from && pieceKind(pos.board[moveFrom(other)]) === kind,
    );
    if (rivals.length > 0) {
      const sameFile = rivals.some((other) => squareFile(moveFrom(other)) === squareFile(from));
      const sameRank = rivals.some((other) => squareRank(moveFrom(other)) === squareRank(from));
      if (!sameFile) san += 'abcdefgh'[squareFile(from)];
      else if (!sameRank) san += squareRank(from) + 1;
      else san += squareName(from);
    }
    if (capture) san += 'x';
    return san + squareName(to);
  }

  private suffixForCheck(): string {
    if (!this.position.inCheck()) return '';
    return this.legalMoves().length === 0 ? '#' : '+';
  }
}

const squareFromName = (name: string): number => (name.charCodeAt(1) - 49) * 8 + (name.charCodeAt(0) - 97);

