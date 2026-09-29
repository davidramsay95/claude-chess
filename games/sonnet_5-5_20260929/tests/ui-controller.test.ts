import { describe, expect, it } from "vitest";
import { Session } from "../src/session";
import { EngineController, type MoveSearcher } from "../src/ui/controller";
import type { Difficulty } from "../src/state";

interface PendingSearch {
  moves: string[];
  difficulty: Difficulty;
  resolve: (move: string | null) => void;
}

class FakeEngine implements MoveSearcher {
  searches: PendingSearch[] = [];
  cancelCount = 0;

  search(_startFen: string, moves: string[], difficulty: Difficulty): Promise<string | null> {
    return new Promise((resolve) => {
      this.searches.push({ moves: [...moves], difficulty, resolve });
    });
  }

  cancel(): void {
    this.cancelCount++;
    const last = this.searches[this.searches.length - 1];
    last?.resolve(null);
  }
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const setup = (): { session: Session; engine: FakeEngine; controller: EngineController; thinking: boolean[] } => {
  const session = new Session();
  const engine = new FakeEngine();
  const thinking: boolean[] = [];
  const controller = new EngineController(session, engine, (value) => thinking.push(value));
  session.onChange = () => controller.sync();
  return { session, engine, controller, thinking };
};

describe("EngineController", () => {
  it("does not search on the human's turn", () => {
    const { session, engine } = setup();
    session.start("white", "easy");
    expect(engine.searches).toHaveLength(0);
  });

  it("searches immediately when the human is black and plays the result", async () => {
    const { session, engine, thinking } = setup();
    session.start("black", "hard");
    expect(engine.searches).toHaveLength(1);
    expect(engine.searches[0].difficulty).toBe("hard");
    expect(thinking.at(-1)).toBe(true);
    engine.searches[0].resolve("e2e4");
    await flush();
    expect(session.game?.moves).toEqual(["e2e4"]);
    expect(thinking.at(-1)).toBe(false);
  });

  it("replies after the human moves", async () => {
    const { session, engine } = setup();
    session.start("white", "medium");
    session.playMove("e2e4");
    expect(engine.searches).toHaveLength(1);
    expect(engine.searches[0].moves).toEqual(["e2e4"]);
    engine.searches[0].resolve("e7e5");
    await flush();
    expect(session.game?.moves).toEqual(["e2e4", "e7e5"]);
    expect(engine.searches).toHaveLength(1);
  });

  it("ignores a stale result after a new game starts", async () => {
    const { session, engine } = setup();
    session.start("black", "easy");
    const stale = engine.searches[0];
    session.start("white", "easy");
    stale.resolve("e2e4");
    await flush();
    expect(session.game?.moves).toEqual([]);
  });

  it("ignores a stale result after resigning and stops thinking", async () => {
    const { session, engine, thinking } = setup();
    session.start("black", "easy");
    const stale = engine.searches[0];
    session.resign();
    stale.resolve("e2e4");
    await flush();
    expect(session.game?.moves).toEqual([]);
    expect(thinking.at(-1)).toBe(false);
  });

  it("ignores a stale result after returning to setup", async () => {
    const { session, engine } = setup();
    session.start("black", "easy");
    const stale = engine.searches[0];
    session.clear();
    stale.resolve("e2e4");
    await flush();
    expect(session.game).toBeNull();
  });

  it("does not start a second search for the same position", () => {
    const { session, engine, controller } = setup();
    session.start("black", "easy");
    controller.sync();
    controller.sync();
    expect(engine.searches).toHaveLength(1);
  });

  it("searches after importing a game where the engine is to move", () => {
    const { session, engine } = setup();
    session.start("white", "easy");
    const outcome = session.load({
      version: 1,
      startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      playerColor: "white",
      difficulty: "expert",
      moves: ["e2e4"],
      resigned: false,
    });
    expect(outcome.ok).toBe(true);
    expect(engine.searches).toHaveLength(1);
    expect(engine.searches[0].difficulty).toBe("expert");
  });

  it("never searches once the game is over", () => {
    const { session, engine } = setup();
    const outcome = session.load({
      version: 1,
      startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      playerColor: "white",
      difficulty: "easy",
      moves: ["f2f3", "e7e5", "g2g4", "d8h4"],
      resigned: false,
    });
    expect(outcome.ok).toBe(true);
    expect(engine.searches).toHaveLength(0);
  });
});
