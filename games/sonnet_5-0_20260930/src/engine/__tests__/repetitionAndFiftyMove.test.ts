import { describe, expect, it } from "vitest";
import { createGame, getLegalMoves, getStatus, makeMove } from "../index";
import type { GameState } from "../types";

describe("threefold repetition", () => {
  it("detects a draw when the same position occurs three times", () => {
    let state: GameState = createGame();
    // Shuffle knights back and forth: Nf3/Nf6 then Ng1/Ng8, three times over,
    // returns to the starting position (move counters included in our
    // position key are turn/castling/board/ep only, not clocks) each cycle.
    const cycle = ["g1f3", "g8f6", "f3g1", "f6g8"];
    for (let i = 0; i < 3; i++) {
      for (const uci of cycle) {
        const move = { from: uci.slice(0, 2), to: uci.slice(2, 4) };
        const result = makeMove(state, move);
        if (!result) throw new Error(`Illegal move ${uci}`);
        state = result.state;
      }
    }
    expect(getStatus(state)).toBe("draw-repetition");
  });
});

describe("fifty-move rule", () => {
  it("detects a draw after 100 half-moves without a pawn move or capture", () => {
    // King-and-rook vs king: with no pawns and nothing to capture, every
    // move increments the halfmove clock. Greedily pick, at each step, a
    // legal move that keeps the game active and doesn't create a *third*
    // occurrence of any position (avoiding an early repetition draw) so we
    // can reliably drive the clock all the way to 100.
    let state: GameState = createGame("7k/8/8/8/8/8/8/R6K w - -");
    let safetyCounter = 0;

    while (state.halfmoveClock < 100) {
      safetyCounter += 1;
      if (safetyCounter > 300) throw new Error("Failed to reach halfmove 100 (infinite loop guard)");

      const candidates = getLegalMoves(state);
      let applied = false;
      for (const move of candidates) {
        const result = makeMove(state, move);
        if (!result) continue;
        const status = getStatus(result.state);
        const key = result.state.positionHistory[result.state.positionHistory.length - 1];
        const occurrences = result.state.positionHistory.filter((k) => k === key).length;
        const reachedTarget = result.state.halfmoveClock >= 100;
        if ((status === "active" || reachedTarget) && occurrences < 3) {
          state = result.state;
          applied = true;
          break;
        }
      }
      if (!applied) throw new Error("No safe non-repeating move available");
    }

    expect(state.halfmoveClock).toBeGreaterThanOrEqual(100);
    expect(getStatus(state)).toBe("draw-fifty-move");
  });
});
