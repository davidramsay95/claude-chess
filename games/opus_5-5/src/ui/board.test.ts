import { describe, expect, it } from "vitest";
import { displaySquares, edgeLabels, isLightSquare, squareAtPoint, squareDistance } from "./board";

describe("displaySquares", () => {
  it("lists squares from a8 to h1 when viewed from White", () => {
    const squares = displaySquares("w");
    expect(squares).toHaveLength(64);
    expect(squares.slice(0, 3)).toEqual(["a8", "b8", "c8"]);
    expect(squares.at(-1)).toBe("h1");
  });

  it("lists squares from h1 to a8 when viewed from Black", () => {
    const squares = displaySquares("b");
    expect(squares.slice(0, 3)).toEqual(["h1", "g1", "f1"]);
    expect(squares.at(-1)).toBe("a8");
  });
});

describe("isLightSquare", () => {
  it.each([
    ["a1", false],
    ["h1", true],
    ["a8", true],
    ["e4", true],
    ["d4", false],
  ])("%s is light: %s", (square, light) => {
    expect(isLightSquare(square)).toBe(light);
  });
});

describe("edgeLabels", () => {
  it("labels the left file with ranks and the bottom rank with files from White", () => {
    expect(edgeLabels("a1", "w")).toEqual({ rank: "1", file: "a" });
    expect(edgeLabels("a5", "w")).toEqual({ rank: "5" });
    expect(edgeLabels("e1", "w")).toEqual({ file: "e" });
    expect(edgeLabels("e5", "w")).toEqual({});
  });

  it("labels the h file and the eighth rank from Black", () => {
    expect(edgeLabels("h8", "b")).toEqual({ rank: "8", file: "h" });
    expect(edgeLabels("a8", "b")).toEqual({ file: "a" });
    expect(edgeLabels("h3", "b")).toEqual({ rank: "3" });
  });
});

describe("squareAtPoint", () => {
  const rect = { left: 100, top: 50, width: 800, height: 800 };

  it("maps a point to the square under it from White's side", () => {
    expect(squareAtPoint({ x: 101, y: 51 }, rect, "w")).toBe("a8");
    expect(squareAtPoint({ x: 899, y: 849 }, rect, "w")).toBe("h1");
    expect(squareAtPoint({ x: 100 + 450, y: 50 + 450 }, rect, "w")).toBe("e4");
  });

  it("maps a point to the square under it from Black's side", () => {
    expect(squareAtPoint({ x: 101, y: 51 }, rect, "b")).toBe("h1");
    expect(squareAtPoint({ x: 100 + 450, y: 50 + 450 }, rect, "b")).toBe("d5");
  });

  it("returns null outside the board", () => {
    expect(squareAtPoint({ x: 99, y: 400 }, rect, "w")).toBeNull();
    expect(squareAtPoint({ x: 400, y: 851 }, rect, "w")).toBeNull();
  });
});

describe("squareDistance", () => {
  it("measures the on-screen offset between squares in square units", () => {
    expect(squareDistance("e2", "e4", "w")).toEqual({ x: 0, y: -2 });
    expect(squareDistance("e2", "e4", "b")).toEqual({ x: 0, y: 2 });
    expect(squareDistance("b1", "c3", "w")).toEqual({ x: 1, y: -2 });
    expect(squareDistance("b1", "c3", "b")).toEqual({ x: -1, y: 2 });
  });
});
