import { describe, expect, it, vi } from "vitest";
import { START_FEN } from "../core/position";
import { serializeGameState, type GameStateV1 } from "./gameState";
import { ChessSession } from "./session";

const FOOLS_MATE: GameStateV1 = {
  version: 1,
  startFen: START_FEN,
  playerColor: "white",
  difficulty: "medium",
  moves: ["f2f3", "e7e5", "g2g4", "d8h4"],
  resigned: false,
};

const startedSession = (): ChessSession => {
  const session = new ChessSession();
  session.newGame("black", "hard");
  session.playMove("e2e4");
  session.playMove("c7c5");
  return session;
};

interface Fingerprint {
  exported: GameStateV1 | null;
  fen: string | null;
  moves: string[] | null;
  playerColor: string;
  difficulty: string;
}

const fingerprint = (session: ChessSession): Fingerprint => ({
  exported: session.exportState(),
  fen: session.game?.position.toFen() ?? null,
  moves: session.game?.moves.map((move) => move.uci) ?? null,
  playerColor: session.playerColor,
  difficulty: session.difficulty,
});

describe("ChessSession before a game", () => {
  it("has no game and exports nothing", () => {
    const session = new ChessSession();
    expect(session.game).toBeNull();
    expect(session.exportState()).toBeNull();
    expect(session.summary()).toBeNull();
    expect(session.isHumanTurn()).toBe(false);
  });

  it("rejects moves and resignation", () => {
    const session = new ChessSession();
    expect(() => session.playMove("e2e4")).toThrow("No game in progress");
    expect(() => session.resign()).toThrow("No game in progress");
  });
});

describe("ChessSession play", () => {
  it("starts a fresh game with the chosen settings", () => {
    const session = new ChessSession();
    session.newGame("black", "expert");
    expect(session.game?.startFen).toBe(START_FEN);
    expect(session.game?.moves).toEqual([]);
    expect(session.playerColor).toBe("black");
    expect(session.difficulty).toBe("expert");
    expect(session.summary()).toEqual({ result: "*", moveCount: 0 });
  });

  it("replaces an existing game with a new object", () => {
    const session = startedSession();
    const before = session.game;
    session.newGame("white", "easy");
    expect(session.game).not.toBe(before);
    expect(session.game?.moves).toEqual([]);
  });

  it("plays moves and tracks whose turn it is", () => {
    const session = new ChessSession();
    session.newGame("white", "medium");
    expect(session.isHumanTurn()).toBe(true);
    const played = session.playMove("e2e4");
    expect(played.san).toBe("e4");
    expect(session.isHumanTurn()).toBe(false);
    session.playMove("e7e5");
    expect(session.isHumanTurn()).toBe(true);
  });

  it("throws on an illegal move without notifying", () => {
    const session = startedSession();
    const listener = vi.fn();
    session.subscribe(listener);
    expect(() => session.playMove("e2e5")).toThrow();
    expect(listener).not.toHaveBeenCalled();
    expect(session.game?.moves).toHaveLength(2);
  });

  it("resigns the human's colour", () => {
    const session = new ChessSession();
    session.newGame("white", "medium");
    session.playMove("e2e4");
    session.resign();
    expect(session.summary()).toEqual({ result: "0-1", moveCount: 1 });
    expect(session.exportState()?.resigned).toBe(true);
    expect(session.isHumanTurn()).toBe(false);
  });

  it("reports no human turn once the game is over", () => {
    const session = new ChessSession();
    session.newGame("black", "medium");
    for (const uci of FOOLS_MATE.moves.slice(0, 3)) session.playMove(uci);
    expect(session.isHumanTurn()).toBe(true);
    session.playMove("d8h4");
    expect(session.summary()).toEqual({ result: "0-1", moveCount: 4 });
    expect(session.isHumanTurn()).toBe(false);
  });

  it("returns to setup and keeps the last settings", () => {
    const session = startedSession();
    session.backToSetup();
    expect(session.game).toBeNull();
    expect(session.exportState()).toBeNull();
    expect(session.playerColor).toBe("black");
    expect(session.difficulty).toBe("hard");
  });
});

describe("ChessSession export and import", () => {
  it("exports the current game", () => {
    const session = new ChessSession();
    session.newGame("white", "medium");
    for (const uci of FOOLS_MATE.moves) session.playMove(uci);
    expect(session.exportState()).toEqual(FOOLS_MATE);
  });

  it("imports a state and adopts its settings", () => {
    const session = new ChessSession();
    expect(session.importState(FOOLS_MATE)).toEqual({ ok: true });
    expect(session.game?.moves.map((move) => move.uci)).toEqual(FOOLS_MATE.moves);
    expect(session.playerColor).toBe("white");
    expect(session.difficulty).toBe("medium");
    expect(session.summary()).toEqual({ result: "0-1", moveCount: 4 });
  });

  it("gives an identical state after export then import into another session", () => {
    const source = startedSession();
    source.resign();
    const exported = source.exportState();

    const target = new ChessSession();
    expect(target.importState(JSON.parse(JSON.stringify(exported)))).toEqual({ ok: true });
    expect(target.exportState()).toEqual(exported);
    expect(target.summary()).toEqual(source.summary());
  });

  it("imports JSON text", () => {
    const session = new ChessSession();
    expect(session.importText(serializeGameState(FOOLS_MATE))).toEqual({ ok: true });
    expect(session.exportState()).toEqual(FOOLS_MATE);
  });

  it.each([
    ["an illegal move", { ...FOOLS_MATE, moves: ["f2f3", "e7e5", "g2g5"] }, "Move 3 (g2g5) is not legal"],
    ["a bad version", { ...FOOLS_MATE, version: 2 }, "Unsupported save version (expected 1)"],
    ["a bad colour", { ...FOOLS_MATE, playerColor: "green" }, 'playerColor must be "white" or "black"'],
    ["a bad FEN", { ...FOOLS_MATE, startFen: "x" }, "startFen is invalid: FEN must have 4 or 6 fields"],
    ["null", null, "Saved game must be a JSON object"],
  ])("leaves the session exactly unchanged after a failed import (%s)", (_label, input, error) => {
    const session = startedSession();
    const gameBefore = session.game;
    const before = fingerprint(session);
    const listener = vi.fn();
    session.subscribe(listener);

    expect(session.importState(input)).toEqual({ ok: false, error });

    expect(session.game).toBe(gameBefore);
    expect(fingerprint(session)).toEqual(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("leaves the setup screen untouched after a failed import", () => {
    const session = new ChessSession();
    const listener = vi.fn();
    session.subscribe(listener);
    expect(session.importText("{oops")).toEqual({ ok: false, error: "Saved game is not valid JSON" });
    expect(session.game).toBeNull();
    expect(session.playerColor).toBe("white");
    expect(session.difficulty).toBe("medium");
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("ChessSession subscriptions", () => {
  it("notifies after every successful change and stops after unsubscribing", () => {
    const session = new ChessSession();
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);

    session.newGame("white", "easy");
    session.playMove("e2e4");
    session.resign();
    session.importState(FOOLS_MATE);
    session.importText(serializeGameState(FOOLS_MATE));
    session.backToSetup();
    expect(listener).toHaveBeenCalledTimes(6);

    unsubscribe();
    session.newGame("white", "easy");
    expect(listener).toHaveBeenCalledTimes(6);
  });

  it("notifies after the change is visible", () => {
    const session = new ChessSession();
    session.newGame("white", "easy");
    const seen: number[] = [];
    session.subscribe(() => {
      seen.push(session.game?.moves.length ?? -1);
    });
    session.playMove("e2e4");
    expect(seen).toEqual([1]);
  });
});
