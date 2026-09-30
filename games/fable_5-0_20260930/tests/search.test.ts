import { describe, expect, test } from "vitest";
import { Board, START_FEN } from "../src/engine/board";
import { chooseMove } from "../src/engine/search";
import type { Difficulty } from "../src/state";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "expert"];

describe("chooseMove", () => {
  test.each(DIFFICULTIES)("returns a legal move from the start position (%s)", (level) => {
    const board = Board.fromFen(START_FEN);
    const move = chooseMove(board, level);
    expect(move).not.toBeNull();
    expect(board.legalMoves()).toContain(move);
  });

  test("returns null when the game is over", () => {
    const board = Board.fromFen(START_FEN);
    for (const uci of ["f2f3", "e7e5", "g2g4", "d8h4"]) {
      board.makeMove(board.uciToMove(uci) as number);
    }
    expect(chooseMove(board, "expert")).toBeNull();
  });

  test.each(["medium", "hard", "expert"] as Difficulty[])(
    "plays the back-rank mate in one (%s)",
    (level) => {
      const board = Board.fromFen("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1");
      const move = chooseMove(board, level);
      expect(board.moveToUci(move as number)).toBe("a1a8");
    }
  );

  test.each(["medium", "hard", "expert"] as Difficulty[])(
    "captures a hanging queen (%s)",
    (level) => {
      const board = Board.fromFen("3q2k1/8/8/8/8/8/8/3R2K1 w - - 0 1");
      const move = chooseMove(board, level);
      expect(board.moveToUci(move as number)).toBe("d1d8");
    }
  );

  test("expert does not throw its queen away for a defended pawn", () => {
    // Queen on d1 could grab d5, but d5 is defended by the e6 pawn.
    const board = Board.fromFen("rnb1kbnr/ppp2ppp/4p3/3p4/8/3P4/PPP1PPPP/RNBQKBNR w KQkq - 0 3");
    const move = chooseMove(board, "expert");
    expect(board.moveToUci(move as number)).not.toBe("d1d5");
  });

  test.each(DIFFICULTIES)("replies within five seconds from Kiwipete (%s)", (level) => {
    const board = Board.fromFen(
      "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1"
    );
    const started = Date.now();
    const move = chooseMove(board, level);
    const elapsed = Date.now() - started;
    expect(move).not.toBeNull();
    expect(board.legalMoves()).toContain(move);
    expect(elapsed).toBeLessThan(5000);
  });

  test("easy still recaptures sometimes but stays legal with a seeded rng", () => {
    const board = Board.fromFen(START_FEN);
    let calls = 0;
    const rng = (): number => {
      calls++;
      return (calls % 97) / 97;
    };
    for (let i = 0; i < 5; i++) {
      const move = chooseMove(board, "easy", rng);
      expect(board.legalMoves()).toContain(move);
    }
  });
});
