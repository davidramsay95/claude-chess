import { describe, expect, it } from "vitest";
import { outcomeMessage, outcomeScore } from "./outcome";

describe("outcomeMessage", () => {
  it("is null while the game is still being played", () => {
    expect(outcomeMessage({ state: "playing" }, "w", false)).toBeNull();
  });

  it("reports a checkmate from the human's point of view", () => {
    expect(outcomeMessage({ state: "checkmate", winner: "w" }, "w", false)).toBe("Checkmate, you win");
    expect(outcomeMessage({ state: "checkmate", winner: "w" }, "b", false)).toBe("Checkmate, you lose");
  });

  it.each([
    ["stalemate", "Draw by stalemate"],
    ["threefold-repetition", "Draw by threefold repetition"],
    ["fifty-move-rule", "Draw by fifty-move rule"],
    ["insufficient-material", "Draw by insufficient material"],
  ] as const)("names the %s draw", (reason, message) => {
    expect(outcomeMessage({ state: "draw", reason }, "w", false)).toBe(message);
  });

  it("reports a resignation", () => {
    expect(outcomeMessage({ state: "playing" }, "b", true)).toBe("You resigned");
  });
});

describe("outcomeScore", () => {
  it("is null while the game is still being played", () => {
    expect(outcomeScore({ state: "playing" }, "w", false)).toBeNull();
  });

  it("uses the conventional score notation", () => {
    expect(outcomeScore({ state: "checkmate", winner: "w" }, "b", false)).toBe("1-0");
    expect(outcomeScore({ state: "checkmate", winner: "b" }, "w", false)).toBe("0-1");
    expect(outcomeScore({ state: "draw", reason: "stalemate" }, "w", false)).toBe("½-½");
  });

  it("awards the game to the engine when the human resigns", () => {
    expect(outcomeScore({ state: "playing" }, "w", true)).toBe("0-1");
    expect(outcomeScore({ state: "playing" }, "b", true)).toBe("1-0");
  });
});
