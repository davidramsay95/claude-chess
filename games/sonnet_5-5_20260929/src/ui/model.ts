import type { Game, GameStatus } from "../engine/game";
import { PAWN, Position, moveFrom, moveTo, parseSquare, pieceType, squareName } from "../engine/position";
import { replayMoves, type PlayerColor } from "../state";

export type ColorChoice = PlayerColor | "random";
export type HistoryStep = "first" | "prev" | "next" | "last";

export interface LegalTarget {
  to: number;
  capture: boolean;
  /** True when the move needs a piece choice; `uci` then lacks the promotion letter. */
  promotion: boolean;
  uci: string;
}

export interface LastMove {
  from: number;
  to: number;
}

export interface MoveCell {
  ply: number;
  san: string;
}

export interface MoveRow {
  number: number;
  white: MoveCell | null;
  black: MoveCell | null;
}

export interface Outcome {
  headline: "You won" | "You lost" | "Draw";
  detail: string;
  tone: "win" | "loss" | "draw";
}

/** The 64 squares in reading order, so the grid needs no coordinate maths. */
export const displaySquares = (flipped: boolean): number[] => {
  const squares: number[] = [];
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 8; column++) {
      const rank = flipped ? row : 7 - row;
      const file = flipped ? 7 - column : column;
      squares.push(rank * 16 + file);
    }
  }
  return squares;
};

export const legalTargets = (position: Position, from: number): LegalTarget[] => {
  const targets = new Map<number, LegalTarget>();
  const piece = position.board[from];
  for (const move of position.legalMoves()) {
    if (moveFrom(move) !== from) continue;
    const to = moveTo(move);
    if (targets.has(to)) {
      // A second move to the same square can only be another promotion choice.
      continue;
    }
    const enPassant = pieceType(piece) === PAWN && (from & 7) !== (to & 7) && position.board[to] === 0;
    const promotion = pieceType(piece) === PAWN && ((to >> 4) === 0 || (to >> 4) === 7);
    targets.set(to, {
      to,
      capture: position.board[to] !== 0 || enPassant,
      promotion,
      uci: `${squareName(from)}${squareName(to)}`,
    });
  }
  return [...targets.values()];
};

export const checkedKingSquare = (position: Position): number =>
  position.inCheck() ? position.kingSquare[position.side] : -1;

/** The move that led to `ply` (1-based count of half-moves played), or null at the start. */
export const lastMoveOf = (moves: readonly string[], ply: number): LastMove | null => {
  if (ply <= 0 || ply > moves.length) return null;
  const uci = moves[ply - 1];
  return { from: parseSquare(uci.slice(0, 2)), to: parseSquare(uci.slice(2, 4)) };
};

/** The live position is returned as-is; earlier plies are replayed into a throwaway copy. */
export const positionAtPly = (game: Game, ply: number): Position => {
  if (ply >= game.moves.length) return game.position;
  const replay = replayMoves(game.startFen, game.moves.slice(0, ply));
  // The moves already passed validation when the game was built, so a failure is a programming error.
  if (!replay.ok) throw new Error(replay.error);
  return replay.game.position;
};

/** `null` means the live position. Landing on the last ply returns to live. */
export const stepPly = (view: number | null, total: number, step: HistoryStep): number | null => {
  const current = view ?? total;
  let next = current;
  if (step === "first") next = 0;
  else if (step === "prev") next = Math.max(0, current - 1);
  else if (step === "next") next = Math.min(total, current + 1);
  else next = total;
  return next >= total ? null : next;
};

export const pairMoves = (sans: readonly string[], startFen: string): MoveRow[] => {
  const fields = startFen.trim().split(/\s+/);
  const blackFirst = fields[1] === "b";
  const parsedNumber = Number.parseInt(fields[5] ?? "1", 10);
  const firstNumber = Number.isFinite(parsedNumber) && parsedNumber > 0 ? parsedNumber : 1;

  const rows: MoveRow[] = [];
  let row: MoveRow | null = null;
  sans.forEach((san, index) => {
    const ply = index + 1;
    const isWhite = blackFirst ? index % 2 === 1 : index % 2 === 0;
    if (isWhite || row === null) {
      row = { number: firstNumber + rows.length, white: null, black: null };
      rows.push(row);
    }
    if (isWhite) row.white = { ply, san };
    else row.black = { ply, san };
  });
  return rows;
};

const REASONS: Record<string, string> = {
  checkmate: "Checkmate",
  stalemate: "Stalemate",
  "threefold repetition": "Threefold repetition",
  "fifty-move rule": "Fifty-move rule",
  "insufficient material": "Insufficient material",
};

export const describeOutcome = (status: GameStatus, playerColor: PlayerColor, resigned: boolean): Outcome | null => {
  if (resigned) return { headline: "You lost", detail: "You resigned", tone: "loss" };
  if (status.result === "*") return null;
  const reason = REASONS[status.reason] ?? status.reason;
  if (status.result === "1/2-1/2") return { headline: "Draw", detail: reason, tone: "draw" };
  const winner: PlayerColor = status.result === "1-0" ? "white" : "black";
  const label = winner === "white" ? "White" : "Black";
  return {
    headline: winner === playerColor ? "You won" : "You lost",
    detail: `${reason}, ${label} wins`,
    tone: winner === playerColor ? "win" : "loss",
  };
};

export const resolveColor = (choice: ColorChoice, random: () => number): PlayerColor => {
  if (choice !== "random") return choice;
  return random() < 0.5 ? "white" : "black";
};
