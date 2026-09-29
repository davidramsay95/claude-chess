import { describe, expect, it } from "vitest";
import { Position, START_FEN } from "../chess/position";
import { evaluate } from "./evaluate";

const swapCase = (char: string): string => (char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase());

/** Flips the board vertically and swaps colours, which must leave the side-to-move score unchanged. */
const mirrorFen = (fen: string): string => {
  const [placement, side, castling, ep, halfmove = "0", fullmove = "1"] = fen.split(" ");
  const mirroredPlacement = placement
    .split("/")
    .reverse()
    .map((rank) => [...rank].map(swapCase).join(""))
    .join("/");
  const mirroredCastling =
    castling === "-"
      ? "-"
      : [...castling]
          .map(swapCase)
          .sort((a, b) => "KQkq".indexOf(a) - "KQkq".indexOf(b))
          .join("");
  const mirroredEp = ep === "-" ? "-" : `${ep[0]}${9 - Number(ep[1])}`;
  return `${mirroredPlacement} ${side === "w" ? "b" : "w"} ${mirroredCastling} ${mirroredEp} ${halfmove} ${fullmove}`;
};

const scoreOf = (fen: string): number => evaluate(Position.fromFen(fen));

const SYMMETRY_FENS = [
  "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
  "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
  "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
  "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
  "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
  "8/5pk1/6p1/3P4/2P5/8/5K2/8 b - - 0 40",
];

describe("evaluate", () => {
  it("scores the start position as level", () => {
    expect(scoreOf(START_FEN)).toBe(0);
  });

  it.each(SYMMETRY_FENS)("gives the same score to the colour-mirrored position: %s", (fen) => {
    expect(scoreOf(mirrorFen(fen))).toBe(scoreOf(fen));
  });

  it("is relative to the side to move", () => {
    const fen = SYMMETRY_FENS[0];
    expect(scoreOf(fen.replace(" w ", " b "))).toBe(-scoreOf(fen));
  });

  it("values an extra queen at well over 800 centipawns", () => {
    expect(scoreOf("rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBeGreaterThan(800);
  });

  it("rewards a passed pawn over one that is blocked by an enemy pawn", () => {
    const passed = scoreOf("4k3/p7/8/4P3/8/8/P7/4K3 w - - 0 1");
    const blocked = scoreOf("4k3/4p3/8/4P3/8/8/P7/4K3 w - - 0 1");
    expect(passed - blocked).toBeGreaterThan(20);
  });

  it("penalises doubled isolated pawns compared with a healthy pair", () => {
    const healthy = scoreOf("4k3/8/8/8/8/8/3PP3/4K3 w - - 0 1");
    const doubled = scoreOf("4k3/8/8/8/8/4P3/4P3/4K3 w - - 0 1");
    expect(healthy - doubled).toBeGreaterThan(20);
  });

  it("rewards the bishop pair", () => {
    const pair = scoreOf("4k3/pppppppp/8/8/8/8/PPPPPPPP/2B1KB2 w - - 0 1");
    const knightAndBishop = scoreOf("4k3/pppppppp/8/8/8/8/PPPPPPPP/2B1KN2 w - - 0 1");
    expect(pair - knightAndBishop).toBeGreaterThan(40);
  });

  it("rewards a rook on an open file over one behind its own pawn", () => {
    const open = scoreOf("4k3/ppp2ppp/8/8/8/8/PPP2PPP/3RK3 w - - 0 1");
    const closed = scoreOf("4k3/ppp2ppp/8/8/8/8/PPP2PPP/R3K3 w - - 0 1");
    expect(open - closed).toBeGreaterThan(15);
  });

  it("rewards a pawn shield in front of a castled king", () => {
    const sheltered = scoreOf("r1bq1rk1/ppp2ppp/2n5/8/8/2N5/PPP2PPP/R1BQ1RK1 w - - 0 1");
    const exposed = scoreOf("r1bq1rk1/ppp2ppp/2n5/8/8/2N2PPP/PPP5/R1BQ1RK1 w - - 0 1");
    expect(sheltered - exposed).toBeGreaterThan(20);
  });
});
