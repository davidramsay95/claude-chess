import type { DrawReason, GameResult, Side } from "@/chess/game";

const DRAW_REASONS: Record<DrawReason, string> = {
  stalemate: "stalemate",
  "threefold-repetition": "threefold repetition",
  "fifty-move-rule": "fifty-move rule",
  "insufficient-material": "insufficient material",
};

/** Describes how the game ended from the human's point of view, or null while it is still in progress. */
export const outcomeMessage = (result: GameResult, humanColor: Side, resigned: boolean): string | null => {
  if (resigned) return "You resigned";
  if (result.state === "checkmate") return result.winner === humanColor ? "Checkmate, you win" : "Checkmate, you lose";
  if (result.state === "draw") return `Draw by ${DRAW_REASONS[result.reason]}`;
  return null;
};

/** The result in conventional score notation ("1-0", "0-1", "½-½"), or null while the game is in progress. */
export const outcomeScore = (result: GameResult, humanColor: Side, resigned: boolean): string | null => {
  const winner = resigned ? (humanColor === "w" ? "b" : "w") : result.state === "checkmate" ? result.winner : null;
  if (winner) return winner === "w" ? "1-0" : "0-1";
  return result.state === "draw" ? "½-½" : null;
};
