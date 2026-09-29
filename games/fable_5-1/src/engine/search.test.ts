import { describe, expect, it } from "vitest";
import { Position } from "./position";
import { moveToUci, uciToMove } from "./move";
import { MATE_SCORE, findBestMove, isMateScore, type Difficulty } from "./search";

const always = (value: number): (() => number) => (): number => value;

const legalUcis = (pos: Position): string[] => pos.legalMoves().map(moveToUci);

describe("findBestMove", () => {
  const MATE_IN_ONE = "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1";

  it.each<Difficulty>(["hard", "expert"])("finds mate in one at %s", (difficulty) => {
    const pos = Position.fromFen(MATE_IN_ONE);
    const result = findBestMove(pos, difficulty, always(0.9));
    expect(moveToUci(result.move)).toBe("a1a8");
    expect(result.score).toBe(MATE_SCORE - 1);
  });

  it("finds the forced mate in two at expert", () => {
    const pos = Position.fromFen(
      "r2qkb1r/pp2nppp/3p4/2pNN1B1/2BnP3/3P4/PPP2PPP/R2bK2R w KQkq - 1 10",
    );
    const result = findBestMove(pos, "expert", always(0.9));
    expect(moveToUci(result.move)).toBe("d5f6");
    expect(isMateScore(result.score)).toBe(true);
  });

  it("finds a mate score with two rooks against a bare king", () => {
    const pos = Position.fromFen("2k5/8/8/8/8/8/8/K2R3R w - - 0 1");
    const result = findBestMove(pos, "expert", always(0.9));
    expect(isMateScore(result.score)).toBe(true);
    expect(result.score).toBeGreaterThan(0);
    expect(result.depth).toBeGreaterThanOrEqual(3);
  });

  it("prefers the shortest mate", () => {
    // Ra8 mates immediately; any rook shuffle still mates later, so the distance adjustment must bite.
    const pos = Position.fromFen("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1");
    const result = findBestMove(pos, "expert", always(0.9));
    expect(moveToUci(result.move)).toBe("a1a8");
  });

  it.each<Difficulty>(["medium", "hard"])("captures a hanging queen at %s", (difficulty) => {
    const pos = Position.fromFen("4k3/8/8/8/8/8/8/3qK3 w - - 0 1");
    const result = findBestMove(pos, difficulty, always(0.9));
    expect(moveToUci(result.move)).toBe("e1d1");
  });

  it("does not fall for a poisoned capture at hard", () => {
    // Taking the pawn with the queen loses the queen to the rook behind it.
    const pos = Position.fromFen("2r5/4k3/8/8/8/8/2p5/3QK3 w - - 0 1");
    const result = findBestMove(pos, "hard", always(0.9));
    expect(moveToUci(result.move)).not.toBe("d1c2");
  });

  it("easy returns a legal move when the random branch is skipped", () => {
    const pos = Position.fromFen(Position.START_FEN);
    const result = findBestMove(pos, "easy", always(0.9));
    expect(legalUcis(pos)).toContain(moveToUci(result.move));
  });

  it("easy returns a legal move when the random branch is taken", () => {
    const pos = Position.fromFen(Position.START_FEN);
    const result = findBestMove(pos, "easy", always(0.1));
    expect(legalUcis(pos)).toContain(moveToUci(result.move));
  });

  it("easy random branch spreads across different legal moves", () => {
    const pos = Position.fromFen(Position.START_FEN);
    const seen = new Set<string>();
    for (const roll of [0.05, 0.25, 0.45]) {
      let calls = 0;
      // First call decides whether to go random; the second picks the move index.
      const random = (): number => (calls++ === 0 ? 0.1 : roll);
      seen.add(moveToUci(findBestMove(pos, "easy", random).move));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("medium sometimes plays one of the top three instead of the best", () => {
    const pos = Position.fromFen("4k3/8/8/8/8/8/8/3qK3 w - - 0 1");
    let calls = 0;
    // 0.1 triggers the top-three branch; 0.99 selects the last of the three candidates.
    const random = (): number => (calls++ === 0 ? 0.1 : 0.99);
    const result = findBestMove(pos, "medium", random);
    expect(legalUcis(pos)).toContain(moveToUci(result.move));
    expect(moveToUci(result.move)).not.toBe("e1d1");
  });

  it("throws when there are no legal moves", () => {
    const mated = Position.fromFen("R5k1/5ppp/8/8/8/8/8/6K1 b - - 1 1");
    expect(() => findBestMove(mated, "hard", always(0.9))).toThrow();
  });

  it.each<Difficulty>(["easy", "medium", "hard", "expert"])(
    "leaves the position unchanged after %s",
    (difficulty) => {
      const pos = Position.fromFen(
        "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
      );
      const before = pos.toFen();
      const history = pos.historyLength();
      findBestMove(pos, difficulty, always(0.1));
      expect(pos.toFen()).toBe(before);
      expect(pos.historyLength()).toBe(history);
    },
  );

  it("treats a repetition inside the search as a draw", () => {
    // Bare white king against king and queen. Both sides have shuffled once, so stepping
    // back to b1 recreates an earlier position; the losing side should grab that draw.
    const pos = Position.fromFen("6qk/8/8/8/8/8/8/K7 w - - 0 1");
    for (const uci of ["a1b1", "h8h7", "b1a1", "h7h8"]) {
      const move = uciToMove(pos, uci);
      if (move === null) throw new Error(`Illegal setup move ${uci}`);
      pos.makeMove(move);
    }
    const result = findBestMove(pos, "hard", always(0.9));
    expect(moveToUci(result.move)).toBe("a1b1");
    expect(result.score).toBe(0);
  });

  it("scores an unavoidable fifty-move draw as zero", () => {
    // Every white move ticks the clock to 100 and none of them mates.
    const drawn = findBestMove(Position.fromFen("k7/8/8/8/8/8/8/K6Q w - - 99 60"), "hard", always(0.9));
    expect(drawn.score).toBe(0);
    const winning = findBestMove(Position.fromFen("k7/8/8/8/8/8/8/K6Q w - - 0 60"), "hard", always(0.9));
    expect(winning.score).toBeGreaterThan(500);
  });

  it("expert respects its time budget on a complex middlegame", () => {
    const pos = Position.fromFen(
      "r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP2BPPP/R2QK2R w KQ - 0 1",
    );
    const started = performance.now();
    const result = findBestMove(pos, "expert", always(0.9));
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(4000);
    expect(result.depth).toBeGreaterThanOrEqual(4);
    expect(legalUcis(pos)).toContain(moveToUci(result.move));
  });

  it("reports nodes and time", () => {
    const result = findBestMove(Position.fromFen(Position.START_FEN), "hard", always(0.9));
    expect(result.nodes).toBeGreaterThan(0);
    expect(result.timeMs).toBeGreaterThanOrEqual(0);
    expect(result.depth).toBe(4);
  });
});
