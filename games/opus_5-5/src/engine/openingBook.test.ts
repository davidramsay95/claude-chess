import { describe, expect, it } from "vitest";
import { NO_MOVE } from "../chess/move";
import { Position, START_FEN } from "../chess/position";
import { BOOK_LINES, bookMove } from "./openingBook";
import { createSeededRandom } from "./seededRandom";

describe("opening book", () => {
  it.each(BOOK_LINES.map((line) => [line]))("contains only legal moves: %s", (line) => {
    const position = Position.fromFen(START_FEN);
    for (const uci of line.split(" ")) {
      const move = position.parseUci(uci);
      expect(move, `${uci} in "${line}"`).not.toBe(NO_MOVE);
      position.makeMove(move);
    }
  });

  it("offers several different first moves across games", () => {
    const firstMoves = new Set(Array.from({ length: 40 }, (_, seed) => bookMove(START_FEN, [], createSeededRandom(seed))));
    expect(firstMoves.size).toBeGreaterThanOrEqual(3);
    expect(firstMoves).toContain("e2e4");
    expect(firstMoves).toContain("d2d4");
  });

  it("continues a known line", () => {
    const reply = bookMove(START_FEN, ["e2e4", "e7e5", "g1f3"], createSeededRandom(1));
    expect(["b8c6", "g8f6"]).toContain(reply);
  });

  it("returns null once the game leaves the book", () => {
    expect(bookMove(START_FEN, ["a2a4"], createSeededRandom(1))).toBeNull();
  });

  it("returns null for games that did not start from the standard position", () => {
    expect(bookMove("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1", [], createSeededRandom(1))).toBeNull();
  });
});
