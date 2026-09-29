import { describe, expect, it } from "vitest";
import { moveToUci } from "../chess/move";
import { Position, START_FEN } from "../chess/position";
import { handleEngineRequest } from "./handleRequest";
import type { EngineRequest } from "./protocol";
import { Searcher } from "./search";
import { createSeededRandom } from "./seededRandom";

const options = { searcher: new Searcher({ transpositionTableBits: 16 }), rng: createSeededRandom(1) };

const request = (overrides: Partial<EngineRequest>): EngineRequest => ({
  id: 7,
  startFen: START_FEN,
  moves: [],
  difficulty: "easy",
  ...overrides,
});

describe("handleEngineRequest", () => {
  it("answers with a legal move for the position after the played moves", () => {
    const moves = ["e2e4", "e7e5", "g1f3"];
    const response = handleEngineRequest(request({ moves }), options);
    expect(response).toMatchObject({ id: 7, ok: true });

    const position = Position.fromFen(START_FEN);
    for (const uci of moves) position.makeMove(position.parseUci(uci));
    const legal = position.generateLegalMoves().map(moveToUci);
    expect(response.ok && legal.includes(response.move)).toBe(true);
  });

  it("plays the mating move at medium strength", () => {
    const response = handleEngineRequest(request({ startFen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", difficulty: "medium" }), options);
    expect(response).toEqual({ id: 7, ok: true, move: "d1d8" });
  });

  it("reports an illegal move in the history", () => {
    const response = handleEngineRequest(request({ moves: ["e2e4", "e7e5", "e4e5"] }), options);
    expect(response).toEqual({ id: 7, ok: false, error: 'Illegal move "e4e5" at index 2' });
  });

  it("reports a finished game with no legal moves", () => {
    const response = handleEngineRequest(request({ moves: ["f2f3", "e7e5", "g2g4", "d8h4"] }), options);
    expect(response).toEqual({ id: 7, ok: false, error: "No legal moves: the game is already over" });
  });

  it("reports a malformed FEN", () => {
    const response = handleEngineRequest(request({ startFen: "not a fen" }), options);
    expect(response.ok).toBe(false);
    expect(!response.ok && response.error).toMatch(/Invalid FEN/);
  });

  it("reports an unknown difficulty from an untyped caller", () => {
    // Worker messages are untyped at runtime; this simulates a bad payload the type system cannot catch.
    const response = handleEngineRequest({ ...request({}), difficulty: "godlike" } as unknown as EngineRequest, options);
    expect(response).toEqual({ id: 7, ok: false, error: 'Unknown difficulty "godlike"' });
  });
  it.each(["medium", "hard", "expert"] as const)("%s plays theory while the game is in the opening book", (difficulty) => {
    const slav = ["d2d4", "d7d5", "c2c4", "c7c6", "g1f3", "g8f6", "b1c3", "d5c4"];
    expect(handleEngineRequest(request({ moves: slav, difficulty }), options)).toEqual({ id: 7, ok: true, move: "a2a4" });
  });
});
