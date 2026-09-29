import {
  FLAG_CASTLE,
  FLAG_CAPTURE,
  FLAG_EN_PASSANT,
  PAWN,
  Position,
  moveFrom,
  moveFlag,
  movePromotion,
  moveTo,
  pieceType,
  squareName,
} from "./position";

const LETTERS = ["", "", "N", "B", "R", "Q", "K"];
const PROMOTION_LETTERS = ["", "", "N", "B", "R", "Q"];

const describeMove = (position: Position, move: number): string => {
  const from = moveFrom(move);
  const to = moveTo(move);
  const flag = moveFlag(move);
  const type = pieceType(position.board[from]);
  const isCapture = flag === FLAG_CAPTURE || flag === FLAG_EN_PASSANT;

  if (flag === FLAG_CASTLE) return to > from ? "O-O" : "O-O-O";

  if (type === PAWN) {
    const prefix = isCapture ? `${squareName(from)[0]}x` : "";
    const promotion = movePromotion(move);
    const suffix = promotion !== 0 ? `=${PROMOTION_LETTERS[promotion]}` : "";
    return `${prefix}${squareName(to)}${suffix}`;
  }

  let disambiguation = "";
  const rivals = position
    .legalMoves()
    .filter((other) => other !== move && moveTo(other) === to && pieceType(position.board[moveFrom(other)]) === type);
  if (rivals.length > 0) {
    const sameFile = rivals.some((other) => (moveFrom(other) & 7) === (from & 7));
    const sameRank = rivals.some((other) => moveFrom(other) >> 4 === from >> 4);
    if (!sameFile) disambiguation = squareName(from)[0];
    else if (!sameRank) disambiguation = squareName(from)[1];
    else disambiguation = squareName(from);
  }
  return `${LETTERS[type]}${disambiguation}${isCapture ? "x" : ""}${squareName(to)}`;
};

/**
 * Converts UCI moves to standard algebraic notation by replaying them from
 * `startFen`. Conversion stops at the first move that is not legal.
 */
export const movesToSan = (startFen: string, uciMoves: readonly string[]): string[] => {
  const position = Position.fromFen(startFen);
  const result: string[] = [];
  for (const uci of uciMoves) {
    const move = position.parseUci(uci);
    if (move === 0) break;
    const text = describeMove(position, move);
    position.makeMove(move);
    const hasReply = position.legalMoves().length > 0;
    const suffix = position.inCheck() ? (hasReply ? "+" : "#") : "";
    result.push(`${text}${suffix}`);
  }
  return result;
};
