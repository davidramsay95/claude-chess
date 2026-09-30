import { describe, expect, it } from "vitest";
import { createGame, getLegalMoves, makeMove, toFen } from "../index";

describe("promotion", () => {
  const fen = "8/P7/8/8/8/8/8/k1K5 w - -";

  (["q", "r", "b", "n"] as const).forEach((promotion) => {
    it(`promotes a pawn to ${promotion} on a normal push`, () => {
      const result = makeMove(createGame(fen), { from: "a7", to: "a8", promotion });
      expect(result).not.toBeNull();
      const rank8 = toFen(result!.state).split(" ")[0].split("/")[0];
      const expectedChar = promotion.toUpperCase();
      expect(rank8[0]).toBe(expectedChar);
    });
  });

  it("generates all four promotion options as legal moves", () => {
    const moves = getLegalMoves(createGame(fen));
    const toA8 = moves.filter((m) => m.from === "a7" && m.to === "a8");
    expect(toA8.map((m) => m.promotion).sort()).toEqual(["b", "n", "q", "r"]);
  });

  it("promotes on a capture", () => {
    const captureFen = "1n6/P7/8/8/8/8/8/k1K5 w - -";
    const result = makeMove(createGame(captureFen), { from: "a7", to: "b8", promotion: "q" });
    expect(result).not.toBeNull();
    expect(result!.isCapture).toBe(true);
    const rank8 = toFen(result!.state).split(" ")[0].split("/")[0];
    expect(rank8).toContain("Q");
  });

  it("rejects a move to the promotion rank without a promotion piece as a different, non-promoting move", () => {
    // A plain pawn-push move to the 8th rank with no `promotion` field does
    // not match any generated pseudo-legal move (which always carries a
    // promotion piece on the last rank), so it must be rejected.
    const result = makeMove(createGame(fen), { from: "a7", to: "a8" });
    expect(result).toBeNull();
  });
});
