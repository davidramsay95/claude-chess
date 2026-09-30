import { Position, DetailedMove, Color, pieceType, isWhitePiece, fileOf, rankOf } from "./types.js";
import { parseFen, toFen, START_FEN } from "./fen.js";
import { generateLegalMoves, makeMove, moveFromUci, uciOfMove, inCheck } from "./moves.js";

export type Result = "1-0" | "0-1" | "1/2-1/2" | "*";

export interface GameSnapshot {
  position: Position;
  moves: DetailedMove[];   // full detailed history
  uciMoves: string[];      // parallel UCI for export
  startFen: string;
  positionKeys: string[];  // for threefold detection (position identity: board+turn+castling+ep)
}

export interface EndState {
  over: boolean;
  result: Result;
  reason?: "checkmate" | "stalemate" | "threefold" | "fifty" | "insufficient" | "resigned";
}

export class Game {
  position: Position;
  history: DetailedMove[] = [];
  uciHistory: string[] = [];
  startFen: string;
  positionKeys: string[] = [];
  resigned: Color | null = null;

  constructor(startFen: string = START_FEN) {
    this.startFen = startFen;
    this.position = parseFen(startFen);
    this.positionKeys.push(positionKey(this.position));
  }

  legalMoves() { return generateLegalMoves(this.position); }
  turn(): Color { return this.position.turn; }
  inCheck(): boolean { return inCheck(this.position, this.position.turn); }

  makeUci(uci: string): DetailedMove | null {
    const mv = moveFromUci(this.position, uci);
    if (!mv) return null;
    const { next, detail } = makeMove(this.position, mv);
    this.position = next;
    this.history.push(detail);
    this.uciHistory.push(uciOfMove(mv));
    this.positionKeys.push(positionKey(this.position));
    return detail;
  }

  resign(color: Color): void { this.resigned = color; }

  endState(): EndState {
    if (this.resigned) {
      return { over: true, result: this.resigned === "w" ? "0-1" : "1-0", reason: "resigned" };
    }
    const legal = this.legalMoves();
    if (legal.length === 0) {
      if (this.inCheck()) {
        // The side to move is checkmated; the other side wins.
        return { over: true, result: this.position.turn === "w" ? "0-1" : "1-0", reason: "checkmate" };
      }
      return { over: true, result: "1/2-1/2", reason: "stalemate" };
    }
    if (this.position.halfmoveClock >= 100) {
      return { over: true, result: "1/2-1/2", reason: "fifty" };
    }
    if (isThreefold(this.positionKeys)) {
      return { over: true, result: "1/2-1/2", reason: "threefold" };
    }
    if (isInsufficientMaterial(this.position)) {
      return { over: true, result: "1/2-1/2", reason: "insufficient" };
    }
    return { over: false, result: "*" };
  }

  fen(): string { return toFen(this.position); }

  snapshot(): GameSnapshot {
    return {
      position: this.position,
      moves: this.history.slice(),
      uciMoves: this.uciHistory.slice(),
      startFen: this.startFen,
      positionKeys: this.positionKeys.slice(),
    };
  }
}

// A position key for repetition: board layout + turn + castling + ep-target,
// but ep-target only counts if an en-passant capture is actually possible.
function positionKey(pos: Position): string {
  let epRelevant: number | null = null;
  if (pos.epTarget !== null) {
    // ep-target is behind the pawn that double-pushed; the mover's pawns must be adjacent to that pawn.
    const epFile = fileOf(pos.epTarget);
    const behindRank = rankOf(pos.epTarget);
    const pawnRank = pos.turn === "w" ? behindRank - 1 : behindRank + 1;
    const myPawn = pos.turn === "w" ? "P" : "p";
    for (const df of [-1, 1]) {
      const nf = epFile + df;
      if (nf < 0 || nf > 7) continue;
      if (pos.board[nf + pawnRank * 8] === myPawn) {
        epRelevant = pos.epTarget; break;
      }
    }
  }
  let s = "";
  for (let i = 0; i < 64; i++) s += pos.board[i] ?? ".";
  s += "|" + pos.turn + "|" + pos.castling + "|" + (epRelevant ?? "-");
  return s;
}

function isThreefold(keys: string[]): boolean {
  const counts = new Map<string, number>();
  for (const k of keys) {
    const n = (counts.get(k) ?? 0) + 1;
    if (n >= 3) return true;
    counts.set(k, n);
  }
  return false;
}

export function isInsufficientMaterial(pos: Position): boolean {
  // Collect non-king pieces
  const whiteMinors: string[] = [];
  const blackMinors: string[] = [];
  let whiteBishopColors = new Set<number>();
  let blackBishopColors = new Set<number>();
  for (let i = 0; i < 64; i++) {
    const p = pos.board[i];
    if (!p) continue;
    const t = pieceType(p);
    if (t === "k") continue;
    if (t === "q" || t === "r" || t === "p") return false;
    // knight or bishop
    if (isWhitePiece(p)) {
      whiteMinors.push(t);
      if (t === "b") whiteBishopColors.add((fileOf(i) + rankOf(i)) % 2);
    } else {
      blackMinors.push(t);
      if (t === "b") blackBishopColors.add((fileOf(i) + rankOf(i)) % 2);
    }
  }
  // K vs K
  if (whiteMinors.length === 0 && blackMinors.length === 0) return true;
  // K + minor vs K
  if (whiteMinors.length === 1 && blackMinors.length === 0) return true;
  if (blackMinors.length === 1 && whiteMinors.length === 0) return true;
  // K + B vs K + B, bishops on same color
  if (whiteMinors.length === 1 && blackMinors.length === 1 && whiteMinors[0] === "b" && blackMinors[0] === "b") {
    if (whiteBishopColors.size === 1 && blackBishopColors.size === 1) {
      const wc = whiteBishopColors.values().next().value;
      const bc = blackBishopColors.values().next().value;
      if (wc === bc) return true;
    }
  }
  return false;
}
