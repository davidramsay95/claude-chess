import { describe, expect, it } from "vitest";
import { createGame, getLegalMoves, moveToUci } from "../../engine/index";
import { handleWorkerRequest, type FindMoveRequest } from "../engineWorker";

describe("handleWorkerRequest", () => {
  it("returns a legal move for a valid FEN and difficulty", () => {
    const state = createGame();
    const legal = new Set(getLegalMoves(state).map((m) => moveToUci(m)));

    const request: FindMoveRequest = {
      type: "find-move",
      requestId: "1",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      difficulty: "easy",
      timeLimitMs: 300,
    };
    const response = handleWorkerRequest(request);

    expect(response.type).toBe("move");
    if (response.type === "move") {
      expect(response.requestId).toBe("1");
      expect(legal.has(response.uci)).toBe(true);
    }
  });

  it("returns an error response for a malformed FEN", () => {
    const request: FindMoveRequest = {
      type: "find-move",
      requestId: "2",
      fen: "not-a-fen",
      difficulty: "medium",
    };
    const response = handleWorkerRequest(request);
    expect(response.type).toBe("error");
    expect(response.requestId).toBe("2");
    if (response.type === "error") {
      expect(response.message.length).toBeGreaterThan(0);
    }
  });

  it("returns an error response when the position has no legal moves", () => {
    const request: FindMoveRequest = {
      type: "find-move",
      requestId: "3",
      fen: "k7/8/1Q6/8/8/8/8/7K b - - 0 1",
      difficulty: "hard",
      timeLimitMs: 200,
    };
    const response = handleWorkerRequest(request);
    expect(response.type).toBe("error");
  });

  it("works for every difficulty level", () => {
    const difficulties = ["easy", "medium", "hard", "expert"] as const;
    for (const difficulty of difficulties) {
      const request: FindMoveRequest = {
        type: "find-move",
        requestId: `d-${difficulty}`,
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        difficulty,
        timeLimitMs: 250,
      };
      const response = handleWorkerRequest(request);
      expect(response.type).toBe("move");
    }
  });
});
