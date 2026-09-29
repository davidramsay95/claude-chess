import { describe, expect, it } from "vitest";
import { Game } from "../src/engine/game";
import { Position, START_FEN, parseSquare } from "../src/engine/position";
import {
  checkedKingSquare,
  describeOutcome,
  displaySquares,
  lastMoveOf,
  legalTargets,
  pairMoves,
  positionAtPly,
  resolveColor,
  stepPly,
} from "../src/ui/model";

const play = (moves: string[]): Game => {
  const game = new Game(START_FEN);
  for (const move of moves) expect(game.playUci(move)).toBe(true);
  return game;
};

describe("displaySquares", () => {
  it("puts a8 top-left and h1 bottom-right for white", () => {
    const squares = displaySquares(false);
    expect(squares).toHaveLength(64);
    expect(squares[0]).toBe(parseSquare("a8"));
    expect(squares[63]).toBe(parseSquare("h1"));
  });

  it("puts h1 top-left and a8 bottom-right when flipped", () => {
    const squares = displaySquares(true);
    expect(squares[0]).toBe(parseSquare("h1"));
    expect(squares[63]).toBe(parseSquare("a8"));
  });
});

describe("legalTargets", () => {
  it("lists pawn pushes without duplicates", () => {
    const targets = legalTargets(new Game(START_FEN).position, parseSquare("e2"));
    expect(targets.map((target) => target.uci).sort()).toEqual(["e2e3", "e2e4"]);
    expect(targets.every((target) => !target.capture && !target.promotion)).toBe(true);
  });

  it("collapses the four promotion choices into one flagged target", () => {
    const position = Position.fromFen("8/P6k/8/8/8/8/8/K7 w - - 0 1");
    const targets = legalTargets(position, parseSquare("a7"));
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ uci: "a7a8", promotion: true });
  });

  it("flags captures including en passant", () => {
    const game = play(["e2e4", "a7a6", "e4e5", "d7d5"]);
    const targets = legalTargets(game.position, parseSquare("e5"));
    const enPassant = targets.find((target) => target.uci === "e5d6");
    expect(enPassant?.capture).toBe(true);
    expect(targets.find((target) => target.uci === "e5e6")?.capture).toBe(false);
  });

  it("returns nothing for an empty square", () => {
    expect(legalTargets(new Game(START_FEN).position, parseSquare("e4"))).toEqual([]);
  });
});

describe("checkedKingSquare", () => {
  it("is -1 when not in check and the king square when in check", () => {
    expect(checkedKingSquare(new Game(START_FEN).position)).toBe(-1);
    const game = play(["e2e4", "f7f5", "d1h5"]);
    expect(checkedKingSquare(game.position)).toBe(parseSquare("e8"));
  });
});

describe("lastMoveOf and positionAtPly", () => {
  it("reads the last move at a ply", () => {
    expect(lastMoveOf([], 0)).toBeNull();
    expect(lastMoveOf(["e2e4", "e7e5"], 1)).toEqual({ from: parseSquare("e2"), to: parseSquare("e4") });
    expect(lastMoveOf(["e2e4", "e7e5"], 2)).toEqual({ from: parseSquare("e7"), to: parseSquare("e5") });
  });

  it("returns the live position for the full ply and a replay otherwise", () => {
    const game = play(["e2e4", "e7e5"]);
    expect(positionAtPly(game, 2)).toBe(game.position);
    const earlier = positionAtPly(game, 1);
    expect(earlier).not.toBe(game.position);
    expect(earlier.board[parseSquare("e4")]).not.toBe(0);
    expect(earlier.board[parseSquare("e5")]).toBe(0);
    expect(game.moves).toHaveLength(2);
  });
});

describe("stepPly", () => {
  it("treats null as live and returns null when landing on live", () => {
    expect(stepPly(null, 4, "prev")).toBe(3);
    expect(stepPly(3, 4, "next")).toBeNull();
    expect(stepPly(null, 4, "next")).toBeNull();
    expect(stepPly(null, 4, "first")).toBe(0);
    expect(stepPly(0, 4, "prev")).toBe(0);
    expect(stepPly(1, 4, "last")).toBeNull();
    expect(stepPly(null, 0, "prev")).toBeNull();
  });
});

describe("pairMoves", () => {
  it("pairs white and black replies under a move number", () => {
    const rows = pairMoves(["e4", "e5", "Nf3"], START_FEN);
    expect(rows).toEqual([
      { number: 1, white: { ply: 1, san: "e4" }, black: { ply: 2, san: "e5" } },
      { number: 2, white: { ply: 3, san: "Nf3" }, black: null },
    ]);
  });

  it("starts with an empty white cell when black is to move first", () => {
    const rows = pairMoves(["e5", "Nf3"], "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 7");
    expect(rows[0]).toEqual({ number: 7, white: null, black: { ply: 1, san: "e5" } });
    expect(rows[1]).toEqual({ number: 8, white: { ply: 2, san: "Nf3" }, black: null });
  });
});

describe("describeOutcome", () => {
  it("reports a win, loss and draw from the player's view", () => {
    expect(describeOutcome({ result: "1-0", reason: "checkmate" }, "white", false)).toMatchObject({
      headline: "You won",
      tone: "win",
      detail: "Checkmate, White wins",
    });
    expect(describeOutcome({ result: "1-0", reason: "checkmate" }, "black", false)).toMatchObject({
      headline: "You lost",
      tone: "loss",
    });
    expect(describeOutcome({ result: "1/2-1/2", reason: "stalemate" }, "white", false)).toMatchObject({
      headline: "Draw",
      tone: "draw",
      detail: "Stalemate",
    });
  });

  it("treats resignation as the player's loss", () => {
    expect(describeOutcome({ result: "*", reason: "ongoing" }, "black", true)).toMatchObject({
      headline: "You lost",
      detail: "You resigned",
    });
  });

  it("returns null while the game is running", () => {
    expect(describeOutcome({ result: "*", reason: "ongoing" }, "white", false)).toBeNull();
  });
});

describe("resolveColor", () => {
  it("passes explicit colours through and uses the random source otherwise", () => {
    expect(resolveColor("white", () => 0.9)).toBe("white");
    expect(resolveColor("black", () => 0.1)).toBe("black");
    expect(resolveColor("random", () => 0.1)).toBe("white");
    expect(resolveColor("random", () => 0.9)).toBe("black");
  });
});
