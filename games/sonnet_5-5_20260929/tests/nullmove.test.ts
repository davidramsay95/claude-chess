import { describe, expect, it } from "vitest";
import { Position } from "../src/engine/position";

describe("null move", () => {
  it("passes the turn and clears en passant, then restores everything on unmake", () => {
    const position = Position.fromFen("rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 3");
    const fen = position.toFen();
    const hashHi = position.hashHi;
    const hashLo = position.hashLo;

    position.makeNullMove();
    expect(position.side).toBe(0);
    expect(position.ep).toBe(-1);
    expect(position.hashLo).not.toBe(hashLo);

    position.unmakeNullMove();
    expect(position.toFen()).toBe(fen);
    expect(position.hashHi).toBe(hashHi);
    expect(position.hashLo).toBe(hashLo);
  });

  it("keeps the position key equal to a freshly parsed position", () => {
    const position = Position.fromFen("4k3/8/8/8/8/8/8/4K2R w K - 0 1");
    position.makeNullMove();
    const fresh = Position.fromFen("4k3/8/8/8/8/8/8/4K2R b K - 1 1");
    expect(position.key).toBe(fresh.key);
  });
});
