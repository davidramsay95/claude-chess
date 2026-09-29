import { describe, expect, it } from "vitest";
import { Position, START_FEN } from "../core/position";
import { evaluate, hasNonPawnMaterial } from "./evaluate";

/** Flips the board vertically and swaps piece colours, side to move, castling and en passant. */
const mirrorFen = (fen: string): string => {
  const [placement, side, castling, ep, halfmove, fullmove] = fen.split(" ");
  const swapCase = (text: string): string =>
    [...text].map((char): string => (char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase())).join("");
  const mirroredPlacement = placement.split("/").reverse().map(swapCase).join("/");
  const mirroredCastling =
    castling === "-"
      ? "-"
      : ["K", "Q", "k", "q"].filter((letter): boolean => swapCase(castling).includes(letter)).join("");
  const mirroredEp = ep === "-" ? "-" : `${ep[0]}${ep[1] === "3" ? "6" : "3"}`;
  return `${mirroredPlacement} ${side === "w" ? "b" : "w"} ${mirroredCastling} ${mirroredEp} ${halfmove} ${fullmove}`;
};

const scoreOf = (fen: string): number => evaluate(Position.fromFen(fen));

const SYMMETRY_FENS = [
  START_FEN,
  "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
  "r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP3PPP/R2QKB1R w KQ - 0 8",
  "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
  "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3",
  "6k1/5ppp/8/3P4/8/2b5/5PPP/3R2K1 b - - 0 30",
];

describe("evaluate", () => {
  it("scores the start position close to zero", () => {
    expect(Math.abs(scoreOf(START_FEN))).toBeLessThanOrEqual(25);
  });

  it.each(SYMMETRY_FENS)("gives the same score to the colour-mirrored position: %s", (fen) => {
    expect(scoreOf(mirrorFen(fen))).toBe(scoreOf(fen));
  });

  it("scores from the side to move's perspective", () => {
    const whiteUpQueen = "rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
    expect(scoreOf(`${whiteUpQueen} w KQkq - 0 1`)).toBeGreaterThan(700);
    expect(scoreOf(`${whiteUpQueen} b KQkq - 0 1`)).toBeLessThan(-700);
  });

  it("values an advanced passed pawn above a backward one in the endgame", () => {
    const advanced = scoreOf("4k3/8/1P6/8/8/8/8/4K3 w - - 0 1");
    const backward = scoreOf("4k3/8/8/8/8/1P6/8/4K3 w - - 0 1");
    expect(advanced).toBeGreaterThan(backward + 30);
  });

  it("penalises doubled and isolated pawns", () => {
    const healthy = scoreOf("4k3/8/8/8/8/8/3PP3/4K3 w - - 0 1");
    const doubledIsolated = scoreOf("4k3/8/8/8/8/3P4/3P4/4K3 w - - 0 1");
    expect(healthy).toBeGreaterThan(doubledIsolated);
  });

  it("rewards the bishop pair", () => {
    const pair = scoreOf("4k3/pppp4/8/8/8/8/PPPP4/2B1KB2 w - - 0 1");
    const bishopAndKnight = scoreOf("4k3/pppp4/8/8/8/8/PPPP4/2B1KN2 w - - 0 1");
    expect(pair).toBeGreaterThan(bishopAndKnight);
  });
});

describe("hasNonPawnMaterial", () => {
  it("is false for the side to move with only king and pawns", () => {
    expect(hasNonPawnMaterial(Position.fromFen("4k3/pp6/8/8/8/8/PP6/4K1N1 b - - 0 1"))).toBe(false);
  });

  it("is true when the side to move has a piece", () => {
    expect(hasNonPawnMaterial(Position.fromFen("4k3/pp6/8/8/8/8/PP6/4K1N1 w - - 0 1"))).toBe(true);
  });
});
