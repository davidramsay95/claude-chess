import { describe, expect, it } from "vitest";
import { Game, type MoveProvider } from "./game";
import { Position } from "../engine/position";
import { moveToUci, uciToMove } from "../engine/move";
import { BLACK, PAWN, QUEEN, ROOK, WHITE, algebraicToSquare } from "../engine/types";

/** Replays the given moves and answers with the first legal move, or a scripted reply when one is queued. */
const stubEngine = (script: string[] = []): MoveProvider => ({
  requestMove: async (startFen, moves) => {
    const scripted = script.shift();
    if (scripted !== undefined) return scripted;
    const pos = Position.fromFen(startFen);
    for (const uci of moves) {
      const m = uciToMove(pos, uci);
      if (m === null) throw new Error(`stub cannot replay ${uci}`);
      pos.makeMove(m);
    }
    return moveToUci(pos.legalMoves()[0]);
  },
});

const sq = algebraicToSquare;

describe("Game", () => {
  it("lets the engine open when the player is Black", async () => {
    const game = new Game(stubEngine(["e2e4"]));
    game.newGame(BLACK, "easy");
    expect(game.isThinking).toBe(true);
    await game.whenIdle();
    expect(game.moves).toEqual(["e2e4"]);
    expect(game.sans).toEqual(["e4"]);
    expect(game.isPlayersTurn()).toBe(true);
  });

  it("appends the player's move and the engine's reply as SAN", async () => {
    const game = new Game(stubEngine(["e7e5"]));
    game.newGame(WHITE, "easy");
    expect(game.playerMove(sq("e2"), sq("e4"))).toEqual({ kind: "ok" });
    expect(game.isPlayersTurn()).toBe(false);
    await game.whenIdle();
    expect(game.sans).toEqual(["e4", "e5"]);
    expect(game.isPlayersTurn()).toBe(true);
  });

  it("notifies listeners on every change", async () => {
    const game = new Game(stubEngine(["e7e5"]));
    let changes = 0;
    game.onChange(() => changes++);
    game.newGame(WHITE, "easy");
    game.playerMove(sq("e2"), sq("e4"));
    await game.whenIdle();
    expect(changes).toBeGreaterThanOrEqual(4);
  });

  it("undoes both the engine reply and the player's move", async () => {
    const game = new Game(stubEngine(["e7e5"]));
    game.newGame(WHITE, "easy");
    game.playerMove(sq("e2"), sq("e4"));
    await game.whenIdle();
    game.undo();
    expect(game.moves).toEqual([]);
    expect(game.position.toFen()).toBe(Position.START_FEN);
    expect(game.isPlayersTurn()).toBe(true);
  });

  it("does nothing on undo when there is nothing to take back", () => {
    const game = new Game(stubEngine());
    game.newGame(WHITE, "easy");
    game.undo();
    expect(game.moves).toEqual([]);
    expect(game.isPlayersTurn()).toBe(true);
  });

  it("rejects illegal moves and moves out of turn", async () => {
    const game = new Game(stubEngine(["e7e5"]));
    game.newGame(WHITE, "easy");
    expect(game.playerMove(sq("e2"), sq("e5"))).toEqual({ kind: "illegal" });
    expect(game.playerMove(sq("e7"), sq("e5"))).toEqual({ kind: "illegal" });
    game.playerMove(sq("e2"), sq("e4"));
    expect(game.playerMove(sq("d2"), sq("d4"))).toEqual({ kind: "not-your-turn" });
    await game.whenIdle();
    expect(game.moves).toEqual(["e2e4", "e7e5"]);
  });

  it("asks for a promotion piece when a pawn reaches the last rank", async () => {
    // White pawn on b7, black king cornered far away. The stub never gets to move.
    const game = new Game(stubEngine());
    game.newGame(WHITE, "easy");
    game.position.loadFen("k7/1P6/8/8/8/8/8/4K3 w - - 0 1");
    expect(game.playerMove(sq("b7"), sq("b8"))).toEqual({ kind: "promotion-needed" });
    expect(game.moves).toEqual([]);
    expect(game.playerMove(sq("b7"), sq("b8"), ROOK)).toEqual({ kind: "ok" });
    expect(game.sans).toEqual(["b8=R+"]);
    await game.whenIdle();
  });

  it("ends the game with the right winner on checkmate", async () => {
    const game = new Game(stubEngine(["e7e5", "b8c6"]));
    game.newGame(WHITE, "easy");
    game.playerMove(sq("e2"), sq("e4"));
    await game.whenIdle();
    game.playerMove(sq("f1"), sq("c4"));
    await game.whenIdle();
    game.playerMove(sq("d1"), sq("h5"));
    await game.whenIdle();
    expect(game.gameOver()).toBeNull();
    // The stub answers with the first legal move so Black walks into Scholar's mate.
    const engineReply = game.moves[game.moves.length - 1];
    expect(engineReply).not.toBe("g8f6");
    expect(game.playerMove(sq("h5"), sq("f7"))).toEqual({ kind: "ok" });
    expect(game.gameOver()).toEqual({ reason: "checkmate", winner: WHITE });
    expect(game.sans[game.sans.length - 1]).toBe("Qxf7#");
    expect(game.isPlayersTurn()).toBe(false);
    expect(game.isThinking).toBe(false);
  });

  it("records a resignation as a win for the engine", () => {
    const game = new Game(stubEngine());
    game.newGame(WHITE, "hard");
    game.resign();
    expect(game.gameOver()).toEqual({ reason: "resigned", winner: BLACK });
    expect(game.isPlayersTurn()).toBe(false);
  });

  it("tracks captured pieces per side, including en passant", async () => {
    const game = new Game(stubEngine(["a7a6", "d7d5", "d8d7"]));
    game.newGame(WHITE, "easy");
    game.playerMove(sq("e2"), sq("e4"));
    await game.whenIdle();
    game.playerMove(sq("e4"), sq("e5"));
    await game.whenIdle();
    expect(game.playerMove(sq("e5"), sq("d6"))).toEqual({ kind: "ok" });
    expect(game.sans[game.sans.length - 1]).toBe("exd6");
    expect(game.captured[WHITE]).toEqual([PAWN]);
    expect(game.captured[BLACK]).toEqual([]);
    await game.whenIdle();
    game.playerMove(sq("d6"), sq("c7"));
    await game.whenIdle();
    expect(game.captured[WHITE]).toEqual([PAWN, PAWN]);
    // Undo removes the capture record along with the moves.
    game.undo();
    expect(game.captured[WHITE]).toEqual([PAWN]);
  });

  it("surfaces engine failures instead of swallowing them", async () => {
    const failing: MoveProvider = { requestMove: async () => "e2e5" };
    const game = new Game(failing);
    game.newGame(BLACK, "easy");
    await game.whenIdle();
    expect(game.engineError).toMatch(/illegal move/);
    expect(game.isThinking).toBe(false);
  });

  it("drops an engine reply that arrives after a new game started", async () => {
    let release: (uci: string) => void = () => undefined;
    const slow: MoveProvider = { requestMove: () => new Promise((resolve) => (release = resolve)) };
    const game = new Game(slow);
    game.newGame(BLACK, "easy");
    const stale = game.whenIdle();
    // The provider is only called after the controller's own await, so let that settle first.
    await new Promise((resolve) => setTimeout(resolve, 0));
    game.newGame(WHITE, "easy");
    release("e2e4");
    await stale;
    expect(game.moves).toEqual([]);
    expect(game.isPlayersTurn()).toBe(true);
  });

  it("promotes to a queen when asked and tracks the captured piece", async () => {
    const game = new Game(stubEngine());
    game.newGame(WHITE, "easy");
    game.position.loadFen("r6k/1P6/8/8/8/8/8/4K3 w - - 0 1");
    expect(game.playerMove(sq("b7"), sq("c8"), QUEEN)).toEqual({ kind: "illegal" });
    expect(game.playerMove(sq("b7"), sq("a8"), QUEEN)).toEqual({ kind: "ok" });
    expect(game.sans).toEqual(["bxa8=Q+"]);
    expect(game.captured[WHITE]).toEqual([ROOK]);
    await game.whenIdle();
  });
});
