import { describe, expect, it } from "vitest";
import { createGame, getLegalMoves, makeMove, toFen } from "../index";

describe("en passant", () => {
  it("sets the en passant target after a two-square pawn push", () => {
    const result = makeMove(createGame(), { from: "e2", to: "e4" });
    expect(result).not.toBeNull();
    expect(toFen(result!.state).split(" ")[3]).toBe("e3");
  });

  it("clears the en passant target on the next move if unused", () => {
    let state = createGame();
    state = makeMove(state, { from: "e2", to: "e4" })!.state;
    state = makeMove(state, { from: "a7", to: "a6" })!.state;
    expect(toFen(state).split(" ")[3]).toBe("-");
  });

  it("allows an en passant capture immediately after the two-square push", () => {
    // White e2-e4, black responds elsewhere, white e4-e5, black d7-d5 (two
    // squares, landing beside white's e5 pawn) -> e5xd6 en passant legal.
    let state = createGame();
    state = makeMove(state, { from: "e2", to: "e4" })!.state;
    state = makeMove(state, { from: "a7", to: "a6" })!.state;
    state = makeMove(state, { from: "e4", to: "e5" })!.state;
    state = makeMove(state, { from: "d7", to: "d5" })!.state;

    expect(toFen(state).split(" ")[3]).toBe("d6");

    const moves = getLegalMoves(state);
    expect(moves).toContainEqual({ from: "e5", to: "d6" });

    const captureResult = makeMove(state, { from: "e5", to: "d6" });
    expect(captureResult).not.toBeNull();
    expect(captureResult!.isCapture).toBe(true);
    // The black pawn that was on d5 must be gone, and white's pawn now on d6.
    const fenRows = toFen(captureResult!.state).split(" ")[0].split("/");
    expect(fenRows[2]).toContain("P"); // rank 6 (index 2 from top) has the white pawn
  });

  it("forbids en passant capture on any later move", () => {
    let state = createGame();
    state = makeMove(state, { from: "e2", to: "e4" })!.state;
    state = makeMove(state, { from: "a7", to: "a6" })!.state;
    state = makeMove(state, { from: "e4", to: "e5" })!.state;
    state = makeMove(state, { from: "d7", to: "d5" })!.state;
    // Intervening move by white that isn't the capture.
    state = makeMove(state, { from: "a2", to: "a3" })!.state;
    state = makeMove(state, { from: "a6", to: "a5" })!.state;

    const moves = getLegalMoves(state);
    expect(moves).not.toContainEqual({ from: "e5", to: "d6" });
  });
});
