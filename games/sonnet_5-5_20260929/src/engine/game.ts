import { Position, moveToUci } from "./position";

export type GameResult = "1-0" | "0-1" | "1/2-1/2" | "*";

export interface GameStatus {
  result: GameResult;
  reason: string;
}

/**
 * A game in progress: a start position plus every half-move played, with
 * the draw and mate rules applied on top of the raw move generator.
 */
export class Game {
  readonly startFen: string;
  readonly position: Position;
  readonly moves: string[] = [];

  constructor(startFen: string) {
    this.startFen = startFen;
    this.position = Position.fromFen(startFen);
  }

  legalUci(): string[] {
    return this.position.legalMoves().map(moveToUci);
  }

  /** Plays a UCI move if it is legal. Returns false and changes nothing otherwise. */
  playUci(uci: string): boolean {
    const move = this.position.parseUci(uci);
    if (move === 0) return false;
    this.position.makeMove(move);
    this.moves.push(uci);
    return true;
  }

  status(): GameStatus {
    const position = this.position;
    if (position.legalMoves().length === 0) {
      if (position.inCheck()) {
        return { result: position.side === 0 ? "0-1" : "1-0", reason: "checkmate" };
      }
      return { result: "1/2-1/2", reason: "stalemate" };
    }
    if (position.isInsufficientMaterial()) return { result: "1/2-1/2", reason: "insufficient material" };
    if (position.repetitionCount() >= 3) return { result: "1/2-1/2", reason: "threefold repetition" };
    if (position.halfmove >= 100) return { result: "1/2-1/2", reason: "fifty-move rule" };
    return { result: "*", reason: "ongoing" };
  }
}
