import { describe, expect, it } from "vitest";
import { Position } from "./position";
import { handleSearchRequest } from "./worker";

describe("handleSearchRequest", () => {
  it("replays the move history and answers with a UCI move", () => {
    const response = handleSearchRequest({
      type: "search",
      id: 7,
      startFen: Position.START_FEN,
      moves: ["e2e4", "e7e5"],
      difficulty: "hard",
    });
    expect(response.type).toBe("result");
    if (response.type !== "result") return;
    expect(response.id).toBe(7);
    const pos = Position.fromFen("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2");
    const legal = new Set(pos.legalMoves().map((m) => m.toString()));
    expect(legal.size).toBeGreaterThan(0);
    expect(response.move).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
    expect(response.depth).toBe(4);
  });

  it("keeps repetition history so a repeated position can be recognised", () => {
    // After two shuffles the drawing move is scored as 0, which only works if history survived.
    const response = handleSearchRequest({
      type: "search",
      id: 1,
      startFen: "6qk/8/8/8/8/8/8/K7 w - - 0 1",
      moves: ["a1b1", "h8h7", "b1a1", "h7h8"],
      difficulty: "hard",
    });
    expect(response).toMatchObject({ type: "result", move: "a1b1", score: 0 });
  });

  it("reports an error for an illegal history move", () => {
    const response = handleSearchRequest({
      type: "search",
      id: 3,
      startFen: Position.START_FEN,
      moves: ["e2e5"],
      difficulty: "easy",
    });
    expect(response.type).toBe("error");
    expect(response.id).toBe(3);
    if (response.type === "error") expect(response.message).toContain("e2e5");
  });

  it("reports an error when the game is already over", () => {
    const response = handleSearchRequest({
      type: "search",
      id: 4,
      startFen: "R5k1/5ppp/8/8/8/8/8/6K1 b - - 1 1",
      moves: [],
      difficulty: "medium",
    });
    expect(response.type).toBe("error");
  });
});
