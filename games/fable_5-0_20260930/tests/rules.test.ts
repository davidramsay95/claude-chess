import { describe, expect, test } from "vitest";
import { Board, START_FEN } from "../src/engine/board";

const uciMoves = (board: Board): string[] => board.legalMoves().map((m) => board.moveToUci(m));

const play = (board: Board, moves: string[]): void => {
  for (const uci of moves) {
    const move = board.uciToMove(uci);
    if (move === null) throw new Error(`Illegal move in test: ${uci}`);
    board.makeMove(move);
  }
};

describe("castling", () => {
  test("both castling moves are legal when the path is clear and safe", () => {
    const board = Board.fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const moves = uciMoves(board);
    expect(moves).toContain("e1g1");
    expect(moves).toContain("e1c1");
  });

  test("castling through an attacked square is forbidden", () => {
    // Black rook on f8 attacks f1, so O-O is out; d-file is safe, O-O-O stays.
    const board = Board.fromFen("5r1k/8/8/8/8/8/8/R3K2R w KQ - 0 1");
    const moves = uciMoves(board);
    expect(moves).not.toContain("e1g1");
    expect(moves).toContain("e1c1");
  });

  test("castling while in check is forbidden", () => {
    const board = Board.fromFen("4r2k/8/8/8/8/8/8/R3K2R w KQ - 0 1");
    const moves = uciMoves(board);
    expect(moves).not.toContain("e1g1");
    expect(moves).not.toContain("e1c1");
  });

  test("queenside castling only needs the b1 square empty, not safe", () => {
    // Black rook attacks b1; b1 may be attacked, only d1/c1 must be safe.
    const board = Board.fromFen("1r5k/8/8/8/8/8/8/R3K3 w Q - 0 1");
    expect(uciMoves(board)).toContain("e1c1");
  });

  test("moving the king loses both castling rights", () => {
    const board = Board.fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    play(board, ["e1e2", "a8a7", "e2e1", "a7a8"]);
    const moves = uciMoves(board);
    expect(moves).not.toContain("e1g1");
    expect(moves).not.toContain("e1c1");
  });

  test("moving a rook loses that side's castling right only", () => {
    const board = Board.fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    play(board, ["h1h2", "a8a7", "h2h1", "a7a8"]);
    const moves = uciMoves(board);
    expect(moves).not.toContain("e1g1");
    expect(moves).toContain("e1c1");
  });

  test("castling executes the rook move too", () => {
    const board = Board.fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    play(board, ["e1g1"]);
    expect(board.toFen().split(" ")[0]).toBe("r3k2r/8/8/8/8/8/8/R4RK1");
  });
});

describe("en passant", () => {
  test("en passant capture is offered and removes the captured pawn", () => {
    const board = Board.fromFen(START_FEN);
    play(board, ["e2e4", "a7a6", "e4e5", "d7d5"]);
    expect(uciMoves(board)).toContain("e5d6");
    play(board, ["e5d6"]);
    expect(board.toFen().split(" ")[0]).toBe("rnbqkbnr/1pp1pppp/p2P4/8/8/8/PPPP1PPP/RNBQKBNR");
  });

  test("en passant is only available immediately", () => {
    const board = Board.fromFen(START_FEN);
    play(board, ["e2e4", "a7a6", "e4e5", "d7d5", "h2h3", "h7h6"]);
    expect(uciMoves(board)).not.toContain("e5d6");
  });

  test("en passant is forbidden when it exposes the king", () => {
    // White king e5, black rook h5: capturing d5xe6 ep would remove both
    // pawns from the fifth rank and leave the king in check from h5.
    const board = Board.fromFen("8/8/8/3pPK1r/8/8/8/4k3 w - d6 0 2");
    expect(uciMoves(board)).not.toContain("e5d6");
  });
});

describe("promotion", () => {
  test("a pawn reaching the last rank may promote to all four pieces", () => {
    const board = Board.fromFen("8/P6k/8/8/8/8/8/K7 w - - 0 1");
    const moves = uciMoves(board);
    expect(moves).toEqual(expect.arrayContaining(["a7a8q", "a7a8r", "a7a8b", "a7a8n"]));
    expect(moves).not.toContain("a7a8");
  });

  test("promotion places the chosen piece on the board", () => {
    const board = Board.fromFen("8/P6k/8/8/8/8/8/K7 w - - 0 1");
    play(board, ["a7a8n"]);
    expect(board.toFen().split(" ")[0]).toBe("N7/7k/8/8/8/8/8/K7");
  });

  test("capture promotions work", () => {
    const board = Board.fromFen("1r6/P6k/8/8/8/8/8/K7 w - - 0 1");
    play(board, ["a7b8q"]);
    expect(board.toFen().split(" ")[0]).toBe("1Q6/7k/8/8/8/8/8/K7");
  });
});

describe("check, checkmate and stalemate", () => {
  test("moves that leave the own king in check are illegal", () => {
    // The e-file knight is pinned by the rook on e8.
    const board = Board.fromFen("4r2k/8/8/8/8/4N3/8/4K3 w - - 0 1");
    const moves = uciMoves(board);
    expect(moves.filter((m) => m.startsWith("e3"))).toEqual([]);
  });

  test("fool's mate is checkmate", () => {
    const board = Board.fromFen(START_FEN);
    play(board, ["f2f3", "e7e5", "g2g4", "d8h4"]);
    expect(board.status()).toBe("checkmate");
    expect(board.inCheck()).toBe(true);
    expect(board.legalMoves()).toEqual([]);
  });

  test("a classic stalemate position is stalemate", () => {
    const board = Board.fromFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(board.status()).toBe("stalemate");
    expect(board.inCheck()).toBe(false);
  });
});

describe("draw rules", () => {
  test("threefold repetition is detected", () => {
    const board = Board.fromFen(START_FEN);
    // Knights shuffle: the start position recurs after every fourth move.
    play(board, ["g1f3", "g8f6", "f3g1", "f6g8"]);
    expect(board.status()).toBe("playing");
    play(board, ["g1f3", "g8f6", "f3g1", "f6g8"]);
    expect(board.status()).toBe("draw-repetition");
  });

  test("repetition requires identical castling rights", () => {
    const board = Board.fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    // Rook trips to a7 and back destroy rights, so positions differ.
    play(board, ["a1a2", "a8a7", "a2a1", "a7a8", "a1a2", "a8a7", "a2a1", "a7a8"]);
    expect(board.status()).not.toBe("draw-repetition");
  });

  test("the fifty-move rule triggers at 100 halfmoves", () => {
    const board = Board.fromFen("7k/8/8/8/8/8/R7/K7 w - - 99 80");
    expect(board.status()).toBe("playing");
    play(board, ["a2b2"]);
    expect(board.status()).toBe("draw-fifty");
  });

  test("a pawn move resets the fifty-move clock", () => {
    const board = Board.fromFen("7k/8/8/8/8/P7/R7/K7 w - - 99 80");
    play(board, ["a3a4"]);
    expect(board.status()).toBe("playing");
    expect(board.halfmoves()).toBe(0);
  });

  test.each([
    ["4k3/8/8/8/8/8/8/4K3 w - - 0 1", "king versus king"],
    ["4k3/8/8/8/8/8/4B3/4K3 w - - 0 1", "king and bishop versus king"],
    ["4k3/8/8/8/8/8/4N3/4K3 w - - 0 1", "king and knight versus king"],
    ["4kb2/8/8/8/8/8/8/2B1K3 w - - 0 1", "same-coloured bishops"]
  ])("insufficient material: %s (%s)", (fen) => {
    expect(Board.fromFen(fen).status()).toBe("draw-material");
  });

  test.each([
    ["4k3/8/8/8/8/8/4P3/4K3 w - - 0 1", "a pawn can win"],
    ["4k3/8/8/8/8/8/4R3/4K3 w - - 0 1", "a rook can win"],
    ["4kb2/8/8/8/8/8/4B3/4K3 w - - 0 1", "opposite-coloured bishops"],
    ["4k3/8/8/8/8/8/3NN3/4K3 w - - 0 1", "two knights are not auto-draw"]
  ])("sufficient material: %s (%s)", (fen) => {
    expect(Board.fromFen(fen).status()).toBe("playing");
  });
});

describe("SAN", () => {
  test("produces standard notation with disambiguation and check marks", () => {
    const board = Board.fromFen(START_FEN);
    const move = board.uciToMove("g1f3");
    expect(move).not.toBeNull();
    expect(board.san(move as number)).toBe("Nf3");
  });

  test("disambiguates by file when two rooks share a rank", () => {
    const board = Board.fromFen("4k3/8/8/8/8/8/4K3/R6R w - - 0 1");
    const move = board.uciToMove("a1d1");
    expect(board.san(move as number)).toBe("Rad1");
  });

  test("marks mate with #", () => {
    const board = Board.fromFen(START_FEN);
    play(board, ["f2f3", "e7e5", "g2g4"]);
    const move = board.uciToMove("d8h4");
    expect(board.san(move as number)).toBe("Qh4#");
  });

  test("castling, promotion and pawn captures", () => {
    const castle = Board.fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    expect(castle.san(castle.uciToMove("e1g1") as number)).toBe("O-O");
    expect(castle.san(castle.uciToMove("e1c1") as number)).toBe("O-O-O");

    // The new queen on b8 checks the e8 king along the back rank.
    const promo = Board.fromFen("1r2k3/P7/8/8/8/8/8/K7 w - - 0 1");
    expect(promo.san(promo.uciToMove("a7b8q") as number)).toBe("axb8=Q+");
  });
});
