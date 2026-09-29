import { describe, expect, it } from "vitest";
import { Session } from "../src/session";
import { START_FEN } from "../src/engine/position";
import { parseStateText, type GameState } from "../src/state";

const FOOLS_MATE: GameState = {
  version: 1,
  startFen: START_FEN,
  playerColor: "white",
  difficulty: "medium",
  moves: ["f2f3", "e7e5", "g2g4", "d8h4"],
  resigned: false,
};

describe("Session", () => {
  it("has no state before a game starts", () => {
    const session = new Session();
    expect(session.snapshot()).toBeNull();
    expect(session.summary()).toBeNull();
  });

  it("exports the played moves in the shared state shape", () => {
    const session = new Session();
    session.start("black", "hard");
    session.playMove("e2e4");
    expect(session.snapshot()).toEqual({
      version: 1,
      startFen: START_FEN,
      playerColor: "black",
      difficulty: "hard",
      moves: ["e2e4"],
      resigned: false,
    });
    expect(session.summary()).toEqual({ result: "*", moveCount: 1 });
  });

  it("round-trips export then import to an identical state", () => {
    const source = new Session();
    source.start("white", "expert");
    for (const move of ["e2e4", "e7e5", "g1f3", "b8c6"]) source.playMove(move);
    const exported = JSON.stringify(source.snapshot());

    const target = new Session();
    const outcome = target.load(JSON.parse(exported));
    expect(outcome).toEqual({ ok: true });
    expect(target.snapshot()).toEqual(source.snapshot());
    expect(target.game?.position.toFen()).toBe(source.game?.position.toFen());
  });

  it("reports the result of a finished game", () => {
    const session = new Session();
    expect(session.load(FOOLS_MATE)).toEqual({ ok: true });
    expect(session.summary()).toEqual({ result: "0-1", moveCount: 4 });
  });

  it("counts a resignation as a win for the engine", () => {
    const session = new Session();
    session.start("white", "easy");
    session.playMove("e2e4");
    session.resign();
    expect(session.snapshot()?.resigned).toBe(true);
    expect(session.summary()).toEqual({ result: "0-1", moveCount: 1 });
  });

  it("restores a resigned game", () => {
    const session = new Session();
    expect(session.load({ ...FOOLS_MATE, moves: ["e2e4"], resigned: true })).toEqual({ ok: true });
    expect(session.summary()).toEqual({ result: "0-1", moveCount: 1 });
  });

  it("rejects an illegal move and leaves the current game unchanged", () => {
    const session = new Session();
    session.start("white", "easy");
    session.playMove("d2d4");
    const before = session.snapshot();
    const outcome = session.load({ ...FOOLS_MATE, moves: ["f2f3", "e7e5", "g2g5"] });
    expect(outcome).toEqual({ ok: false, error: "Move 3 (g2g5) is not legal" });
    expect(session.snapshot()).toEqual(before);
  });

  it("rejects moves played after the game has ended", () => {
    const session = new Session();
    const outcome = session.load({ ...FOOLS_MATE, moves: [...FOOLS_MATE.moves, "a2a3"] });
    expect(outcome.ok).toBe(false);
    expect(session.snapshot()).toBeNull();
  });

  it.each([
    ["null", null],
    ["a string", "hello"],
    ["wrong version", { ...FOOLS_MATE, version: 2 }],
    ["bad colour", { ...FOOLS_MATE, playerColor: "red" }],
    ["bad difficulty", { ...FOOLS_MATE, difficulty: "godlike" }],
    ["moves not an array", { ...FOOLS_MATE, moves: "e2e4" }],
    ["non-string move", { ...FOOLS_MATE, moves: [12] }],
    ["resigned not boolean", { ...FOOLS_MATE, resigned: "yes" }],
    ["invalid fen", { ...FOOLS_MATE, startFen: "not a fen" }],
  ])("rejects %s", (_name, raw) => {
    const session = new Session();
    expect(session.load(raw).ok).toBe(false);
    expect(session.snapshot()).toBeNull();
  });

  it("parses pasted JSON text and reports malformed text", () => {
    expect(parseStateText(JSON.stringify(FOOLS_MATE)).ok).toBe(true);
    const bad = parseStateText("{oops");
    expect(bad.ok).toBe(false);
  });
});
