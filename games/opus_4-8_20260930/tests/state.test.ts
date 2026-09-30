import { describe, expect, it } from "vitest";
import { Game } from "../src/game/game.ts";
import { exportStateJson, parseState, tryLoadState } from "../src/game/state.ts";
import { GameState } from "../src/game/types.ts";

const FOOLS_MATE: GameState = {
  version: 1,
  startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  playerColor: "white",
  difficulty: "medium",
  moves: ["f2f3", "e7e5", "g2g4", "d8h4"],
  resigned: false,
};

describe("export then import", () => {
  it("round-trips to an identical state", () => {
    const game = Game.fromState(FOOLS_MATE);
    const json = exportStateJson(game);
    const reloaded = tryLoadState(json);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) {
      expect(reloaded.game.toState()).toEqual(FOOLS_MATE);
    }
  });

  it("accepts an already-parsed object as well as a JSON string", () => {
    expect(parseState(JSON.stringify(FOOLS_MATE))).toEqual(FOOLS_MATE);
    expect(parseState(FOOLS_MATE)).toEqual(FOOLS_MATE);
  });

  it("preserves a resigned flag", () => {
    const game = new Game("black", "hard");
    game.applyUci("e2e4");
    game.resign();
    const outcome = tryLoadState(exportStateJson(game));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.game.resigned).toBe(true);
      expect(outcome.game.status().result).toBe("1-0");
    }
  });
});

describe("invalid states are rejected", () => {
  it("rejects an illegal move without throwing", () => {
    const bad = { ...FOOLS_MATE, moves: ["e2e4", "e7e5", "g2g5"] };
    const outcome = tryLoadState(bad);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/g2g5/);
  });

  it("rejects malformed JSON", () => {
    expect(tryLoadState("{not json").ok).toBe(false);
  });

  it("rejects a wrong version and bad fields", () => {
    expect(tryLoadState({ ...FOOLS_MATE, version: 2 }).ok).toBe(false);
    expect(tryLoadState({ ...FOOLS_MATE, playerColor: "green" }).ok).toBe(false);
    expect(tryLoadState({ ...FOOLS_MATE, difficulty: "insane" }).ok).toBe(false);
    expect(tryLoadState({ ...FOOLS_MATE, moves: [1, 2, 3] }).ok).toBe(false);
    expect(tryLoadState(null).ok).toBe(false);
  });

  it("leaves the caller's current game untouched on a failed load", () => {
    const current = Game.fromState(FOOLS_MATE);
    const before = current.toState();
    const outcome = tryLoadState({ ...FOOLS_MATE, moves: ["z9z9"] });
    expect(outcome.ok).toBe(false);
    expect(current.toState()).toEqual(before); // unchanged
  });
});
