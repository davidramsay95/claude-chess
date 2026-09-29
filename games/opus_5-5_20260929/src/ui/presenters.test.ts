import { describe, expect, it } from "vitest";
import { describeStatus, displaySquare, scoresheetRows, squareAtPoint } from "./presenters";

describe("board geometry", () => {
  const rect = { left: 100, top: 50, width: 800, height: 800 };

  it("maps the top-left cell to a8 for white and h1 for black", () => {
    expect(displaySquare(0, "white")).toBe(0x70);
    expect(displaySquare(0, "black")).toBe(0x07);
    expect(displaySquare(63, "white")).toBe(0x07);
  });

  it("finds the square under a point", () => {
    expect(squareAtPoint(150, 100, rect, "white")).toBe(0x70); // a8
    expect(squareAtPoint(850, 800, rect, "white")).toBe(0x07); // h1
    expect(squareAtPoint(150, 100, rect, "black")).toBe(0x07); // h1
    expect(squareAtPoint(550, 700, rect, "white")).toBe(0x14); // e2
  });

  it("returns -1 outside the board", () => {
    expect(squareAtPoint(99, 100, rect, "white")).toBe(-1);
    expect(squareAtPoint(150, 851, rect, "white")).toBe(-1);
  });
});

describe("scoresheet", () => {
  it("pairs moves into numbered rows", () => {
    expect(scoresheetRows(["e4", "e5", "Nf3"], 1, "white")).toEqual([
      { number: 1, white: { san: "e4", ply: 1 }, black: { san: "e5", ply: 2 } },
      { number: 2, white: { san: "Nf3", ply: 3 }, black: null },
    ]);
  });

  it("starts with an empty white cell when black moves first", () => {
    expect(scoresheetRows(["Kd8", "Kd2"], 30, "black")).toEqual([
      { number: 30, white: null, black: { san: "Kd8", ply: 1 } },
      { number: 31, white: { san: "Kd2", ply: 2 }, black: null },
    ]);
  });
});

describe("status text", () => {
  it("names whose turn it is", () => {
    expect(describeStatus({ result: "*", reason: null, inCheck: false }, "white", "white")).toBe("Your move");
    expect(describeStatus({ result: "*", reason: null, inCheck: false }, "black", "white")).toBe("Engine is thinking");
    expect(describeStatus({ result: "*", reason: null, inCheck: true }, "white", "white")).toBe("Check. Your move");
  });

  it("describes each ending from the player's point of view", () => {
    expect(describeStatus({ result: "1-0", reason: "checkmate", inCheck: true }, "black", "white")).toBe(
      "Checkmate. You win",
    );
    expect(describeStatus({ result: "1-0", reason: "checkmate", inCheck: true }, "black", "black")).toBe(
      "Checkmate. The engine wins",
    );
    expect(describeStatus({ result: "0-1", reason: "resignation", inCheck: false }, "white", "white")).toBe(
      "You resigned. The engine wins",
    );
    expect(describeStatus({ result: "1/2-1/2", reason: "stalemate", inCheck: false }, "white", "white")).toBe(
      "Draw by stalemate",
    );
    expect(describeStatus({ result: "1/2-1/2", reason: "threefold", inCheck: false }, "white", "white")).toBe(
      "Draw by threefold repetition",
    );
    expect(describeStatus({ result: "1/2-1/2", reason: "fifty-move", inCheck: false }, "white", "white")).toBe(
      "Draw by the fifty-move rule",
    );
    expect(describeStatus({ result: "1/2-1/2", reason: "insufficient", inCheck: false }, "white", "white")).toBe(
      "Draw by insufficient material",
    );
  });
});
