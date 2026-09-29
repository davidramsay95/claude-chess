import { describe, expect, it } from "vitest";
import { movesToSan } from "../src/engine/san";
import { START_FEN } from "../src/engine/position";

describe("movesToSan", () => {
  it("writes pawn and piece moves", () => {
    expect(movesToSan(START_FEN, ["e2e4", "e7e5", "g1f3", "b8c6"])).toEqual(["e4", "e5", "Nf3", "Nc6"]);
  });

  it("writes captures, checks and mate", () => {
    expect(movesToSan(START_FEN, ["f2f3", "e7e5", "g2g4", "d8h4"])).toEqual(["f3", "e5", "g4", "Qh4#"]);
    expect(movesToSan(START_FEN, ["e2e4", "d7d5", "e4d5"])).toEqual(["e4", "d5", "exd5"]);
    expect(movesToSan(START_FEN, ["e2e4", "f7f5", "d1h5"])).toEqual(["e4", "f5", "Qh5+"]);
  });

  it("writes castling", () => {
    expect(movesToSan("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", ["e1g1", "e8c8"])).toEqual(["O-O", "O-O-O"]);
  });

  it("writes promotion with capture", () => {
    expect(movesToSan("1n2k3/P7/8/8/8/8/8/4K3 w - - 0 1", ["a7b8q"])).toEqual(["axb8=Q+"]);
  });

  it("disambiguates by file, by rank and by both", () => {
    expect(movesToSan("4k3/8/8/8/8/8/4K3/R6R w - - 0 1", ["a1d1"])).toEqual(["Rad1"]);
    expect(movesToSan("4k3/8/8/R7/8/8/8/R3K3 w - - 0 1", ["a1a3"])).toEqual(["R1a3"]);
    expect(movesToSan("6k1/8/8/8/Q2Q4/8/8/Q3K3 w - - 0 1", ["a4d1"])).toEqual(["Qa4d1"]);
  });

  it("writes en passant as a pawn capture", () => {
    expect(movesToSan(START_FEN, ["e2e4", "a7a6", "e4e5", "d7d5", "e5d6"]).at(-1)).toBe("exd6");
  });

  it("stops at the first illegal move", () => {
    expect(movesToSan(START_FEN, ["e2e4", "e2e4"])).toEqual(["e4"]);
  });
});
