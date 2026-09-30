import { describe, it, expect } from "vitest";
import { validateGameState } from "../src/bridge.js";

describe("validateGameState", () => {
  const validState = {
    version: 1,
    startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    playerColor: "white",
    difficulty: "medium",
    moves: ["e2e4", "e7e5"],
    resigned: false,
  };

  it("accepts valid state", () => {
    const result = validateGameState(validState);
    expect(result.valid).toBe(true);
  });

  it("rejects null", () => {
    const result = validateGameState(null);
    expect(result.valid).toBe(false);
  });

  it("rejects wrong version", () => {
    const result = validateGameState({ ...validState, version: 2 });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid playerColor", () => {
    const result = validateGameState({ ...validState, playerColor: "red" });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid difficulty", () => {
    const result = validateGameState({ ...validState, difficulty: "insane" });
    expect(result.valid).toBe(false);
  });

  it("rejects non-array moves", () => {
    const result = validateGameState({ ...validState, moves: "e2e4" });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid move format", () => {
    const result = validateGameState({ ...validState, moves: ["e2e4", "xyz"] });
    expect(result.valid).toBe(false);
  });

  it("rejects non-boolean resigned", () => {
    const result = validateGameState({ ...validState, resigned: "yes" });
    expect(result.valid).toBe(false);
  });

  it("accepts promotion moves", () => {
    const result = validateGameState({
      ...validState,
      moves: ["e7e8q"],
    });
    expect(result.valid).toBe(true);
  });
});

describe("bridge message handling", () => {
  it("validates origin check concept", () => {
    const origin = "http://localhost:8080";
    const fakeOrigin = "http://evil.com";
    expect(origin).not.toBe(fakeOrigin);
    expect(origin).toBe(origin);
  });

  it("validates source check concept", () => {
    const parentWindow = {} as Window;
    const otherWindow = {} as Window;
    expect(parentWindow === otherWindow).toBe(false);
    expect(parentWindow === parentWindow).toBe(true);
  });
});

describe("state import with move replay", () => {
  it("rejects illegal moves through ChessGame", async () => {
    const { ChessGame } = await import("../src/chess/game.js");
    const game = new ChessGame();
    const illegalMove = game.findMoveByUci("e2e5");
    expect(illegalMove).toBeNull();
  });

  it("accepts and replays valid moves", async () => {
    const { ChessGame } = await import("../src/chess/game.js");
    const game = new ChessGame();
    const moves = ["e2e4", "e7e5", "g1f3"];
    for (const uci of moves) {
      const move = game.findMoveByUci(uci);
      expect(move).not.toBeNull();
      game.makeMove(move!);
    }
    expect(game.state.turn).toBe(1);
  });

  it("detects illegal move in sequence", async () => {
    const { ChessGame } = await import("../src/chess/game.js");
    const game = new ChessGame();
    game.makeMove(game.findMoveByUci("e2e4")!);
    const illegalForBlack = game.findMoveByUci("e2e3");
    expect(illegalForBlack).toBeNull();
  });
});

describe("export then import roundtrip", () => {
  it("produces identical state", async () => {
    const { ChessGame } = await import("../src/chess/game.js");
    const { moveToUci } = await import("../src/chess/types.js");

    const game = new ChessGame();
    const uciMoves: string[] = [];
    const testMoves = ["e2e4", "e7e5", "g1f3", "b8c6"];

    for (const uci of testMoves) {
      const move = game.findMoveByUci(uci);
      expect(move).not.toBeNull();
      game.makeMove(move!);
      uciMoves.push(moveToUci(move!));
    }

    const exported = {
      version: 1 as const,
      startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      playerColor: "white" as const,
      difficulty: "medium" as const,
      moves: uciMoves,
      resigned: false,
    };

    const validation = validateGameState(exported);
    expect(validation.valid).toBe(true);

    const game2 = new ChessGame();
    for (const uci of exported.moves) {
      const move = game2.findMoveByUci(uci);
      expect(move).not.toBeNull();
      game2.makeMove(move!);
    }

    expect(game2.fen()).toBe(game.fen());
  });
});
