import type { JSX } from "react";
import { getStatus, getWinner, isInCheck } from "../engine/index";
import type { GameRecord } from "../lib/gameRecord";

interface GameStatusBannerProps {
  record: GameRecord;
}

function describeStatus(record: GameRecord): { text: string; tone: "info" | "over" } | null {
  if (record.resigned) {
    const winner = record.playerColor === "white" ? "Black" : "White";
    return { text: `You resigned. ${winner} wins.`, tone: "over" };
  }

  const status = getStatus(record.state);
  switch (status) {
    case "checkmate": {
      const winner = getWinner(record.state);
      const winnerLabel = winner === "white" ? "White" : "Black";
      return { text: `Checkmate — ${winnerLabel} wins.`, tone: "over" };
    }
    case "stalemate":
      return { text: "Draw — stalemate.", tone: "over" };
    case "draw-repetition":
      return { text: "Draw — threefold repetition.", tone: "over" };
    case "draw-fifty-move":
      return { text: "Draw — fifty-move rule.", tone: "over" };
    case "draw-insufficient-material":
      return { text: "Draw — insufficient material.", tone: "over" };
    case "active":
      if (isInCheck(record.state, record.state.turn)) {
        const turnLabel = record.state.turn === "white" ? "White" : "Black";
        return { text: `${turnLabel} is in check.`, tone: "info" };
      }
      return null;
  }
}

export function GameStatusBanner({ record }: GameStatusBannerProps): JSX.Element | null {
  const status = describeStatus(record);
  if (!status) return null;

  return (
    <div className={`status-banner status-banner--${status.tone}`} role="status">
      {status.text}
    </div>
  );
}
