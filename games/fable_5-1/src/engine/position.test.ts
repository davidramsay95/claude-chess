import { describe, expect, it } from "vitest";
import { Position } from "./position";
import { moveToUci, uciToMove } from "./move";

const play = (pos: Position, ...ucis: string[]): void => {
  for (const u of ucis) {
    const move = uciToMove(pos, u);
    if (!move) throw new Error(`illegal move ${u} in ${pos.toFen()}`);
    pos.makeMove(move);
  }
};

describe("Position FEN round-trip", () => {
  it("serialises the start position", () => {
    expect(Position.fromFen(Position.START_FEN).toFen()).toBe(Position.START_FEN);
  });

  it("round-trips a mid-game position with castling rights and en passant", () => {
    const fen = "rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3";
    expect(Position.fromFen(fen).toFen()).toBe(fen);
  });
});

describe("game status", () => {
  it("detects checkmate (fool's mate)", () => {
    const pos = Position.fromFen(Position.START_FEN);
    play(pos, "f2f3", "e7e5", "g2g4", "d8h4");
    expect(pos.status().kind).toBe("checkmate");
    expect(pos.status().winner).toBe("b");
  });

  it("detects stalemate", () => {
    const pos = Position.fromFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(pos.status().kind).toBe("stalemate");
  });

  it("detects insufficient material (king vs king and bishop)", () => {
    const pos = Position.fromFen("7k/8/8/8/8/8/8/KB6 w - - 0 1");
    expect(pos.status().kind).toBe("insufficient");
  });

  it("treats K+N+N vs K as ongoing because a helpmate is still possible", () => {
    const pos = Position.fromFen("7k/8/8/8/8/8/8/KNN5 w - - 0 1");
    expect(pos.status().kind).toBe("ongoing");
  });

  it("detects the fifty-move rule", () => {
    const pos = Position.fromFen("7k/8/8/8/8/8/8/K6R w - - 100 80");
    expect(pos.status().kind).toBe("fifty-move");
  });

  it("detects threefold repetition", () => {
    const pos = Position.fromFen(Position.START_FEN);
    play(pos, "g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8");
    expect(pos.status().kind).toBe("repetition");
  });

  it("reports ongoing and check", () => {
    const pos = Position.fromFen(Position.START_FEN);
    play(pos, "e2e4", "f7f5", "d1h5");
    expect(pos.status().kind).toBe("ongoing");
    expect(pos.inCheck()).toBe(true);
  });
});

describe("special moves", () => {
  it("performs castling and moves the rook", () => {
    const pos = Position.fromFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    play(pos, "e1g1");
    expect(pos.toFen()).toBe("r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1");
  });

  it("forbids castling through check", () => {
    const pos = Position.fromFen("r3kr2/8/8/8/8/8/8/R3K2R w KQq - 0 1");
    const ucis = pos.legalMoves().map(moveToUci);
    expect(ucis).not.toContain("e1g1");
    expect(ucis).toContain("e1c1");
  });

  it("captures en passant", () => {
    const pos = Position.fromFen("rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3");
    play(pos, "e5d6");
    expect(pos.toFen()).toBe("rnbqkbnr/ppp1pppp/3P4/8/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3");
  });

  it("promotes with a choice of piece", () => {
    const pos = Position.fromFen("8/P6k/8/8/8/8/8/K7 w - - 0 1");
    const promos = pos.legalMoves().map(moveToUci).sort();
    expect(promos).toEqual(["a1a2", "a1b1", "a1b2", "a7a8b", "a7a8n", "a7a8q", "a7a8r"]);
    play(pos, "a7a8q");
    expect(pos.toFen()).toBe("Q7/7k/8/8/8/8/8/K7 b - - 0 1");
  });

  it("undoes moves back to the original position", () => {
    const pos = Position.fromFen(Position.START_FEN);
    play(pos, "e2e4", "d7d5", "e4d5");
    pos.undoMove();
    pos.undoMove();
    pos.undoMove();
    expect(pos.toFen()).toBe(Position.START_FEN);
  });
});
