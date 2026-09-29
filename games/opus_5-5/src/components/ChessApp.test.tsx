// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngineClient } from "@/engine/engineClient";
import type { MoveRequest } from "@/engine/protocol";
import { ChessApp } from "./ChessApp";

afterEach(cleanup);

/** Engine replies are applied after a short minimum delay, so allow for it when waiting. */
const ENGINE_WAIT = { timeout: 2000 };

interface FakeEngine {
  createEngine: () => EngineClient;
  requests: MoveRequest[];
  terminate: ReturnType<typeof vi.fn>;
}

const scriptedEngine = (replies: string[]): FakeEngine => {
  const requests: MoveRequest[] = [];
  const terminate = vi.fn();
  const client: EngineClient = {
    requestMove: async (request) => {
      requests.push({ ...request, moves: [...request.moves] });
      const reply = replies.shift();
      if (!reply) throw new Error("No scripted reply");
      return reply;
    },
    terminate,
  };
  return { createEngine: () => client, requests, terminate };
};

/** An engine that never answers, to observe the UI while the engine is thinking. */
const silentEngine = (): FakeEngine => {
  const requests: MoveRequest[] = [];
  const client: EngineClient = {
    requestMove: (request) => {
      requests.push(request);
      return new Promise<string>(() => {});
    },
    terminate: vi.fn(),
  };
  return { createEngine: () => client, requests, terminate: vi.fn() };
};

const square = (name: string): HTMLElement => screen.getByRole("button", { name: new RegExp(`^${name}(,|$)`) });
const board = (): HTMLElement => screen.getByRole("group", { name: "Chess board" });
const topLeftSquare = (): string | null => within(board()).getAllByRole("button")[0].getAttribute("aria-label");
const targetedSquares = (): string[] =>
  within(board())
    .getAllByRole("button")
    .filter((element) => element.dataset.target)
    .map((element) => element.getAttribute("aria-label") ?? "");

const startGame = async (user: UserEvent, side: "White" | "Black", difficulty = "Medium"): Promise<void> => {
  await user.click(screen.getByRole("radio", { name: side }));
  await user.click(screen.getByRole("radio", { name: difficulty }));
  await user.click(screen.getByRole("button", { name: "Start game" }));
};

const playMove = async (user: UserEvent, from: string, to: string): Promise<void> => {
  await user.click(square(from));
  await user.click(square(to));
};

describe("setup", () => {
  it("starts a game as White with the board seen from White's side", async () => {
    const user = userEvent.setup();
    const engine = scriptedEngine([]);
    render(<ChessApp createEngine={engine.createEngine} />);

    await startGame(user, "White");

    expect(topLeftSquare()).toBe("a8, black rook");
    expect(square("e2")).toHaveAccessibleName("e2, white pawn");
    expect(screen.getByText("Your move")).toBeInTheDocument();
    expect(engine.requests).toEqual([]);
  });

  it("lets the engine move first and flips the board when playing Black", async () => {
    const user = userEvent.setup();
    const engine = scriptedEngine(["e2e4"]);
    render(<ChessApp createEngine={engine.createEngine} />);

    await startGame(user, "Black", "Hard");

    expect(topLeftSquare()).toBe("h1, white rook");
    expect(await screen.findByRole("button", { name: "e4, white pawn" }, ENGINE_WAIT)).toBeInTheDocument();
    expect(engine.requests[0]).toEqual({ startFen: expect.any(String), moves: [], difficulty: "hard" });
  });
});

describe("moving", () => {
  it("shows legal targets for the selected piece and plays the chosen one", async () => {
    const user = userEvent.setup();
    const engine = scriptedEngine(["e7e5"]);
    render(<ChessApp createEngine={engine.createEngine} />);
    await startGame(user, "White");

    await user.click(square("g1"));
    expect(targetedSquares().sort()).toEqual(["f3", "h3"]);

    await user.click(square("f3"));
    expect(square("f3")).toHaveAccessibleName("f3, white knight");
    expect(await screen.findByRole("button", { name: "e5, black pawn" }, ENGINE_WAIT)).toBeInTheDocument();
    expect(engine.requests[0].moves).toEqual(["g1f3"]);
  });

  it("marks captures differently from quiet moves", async () => {
    const user = userEvent.setup();
    const engine = scriptedEngine(["d7d5"]);
    render(<ChessApp createEngine={engine.createEngine} />);
    await startGame(user, "White");
    await playMove(user, "e2", "e4");
    await screen.findByRole("button", { name: "d5, black pawn" }, ENGINE_WAIT);

    await user.click(square("e4"));

    expect(square("d5")).toHaveAttribute("data-target", "capture");
    expect(square("e5")).toHaveAttribute("data-target", "move");
  });

  it("does not let the human select the engine's pieces", async () => {
    const user = userEvent.setup();
    render(<ChessApp createEngine={scriptedEngine([]).createEngine} />);
    await startGame(user, "White");

    await user.click(square("e7"));

    expect(targetedSquares()).toEqual([]);
  });

  it("does not let the human move while the engine is thinking", async () => {
    const user = userEvent.setup();
    const engine = silentEngine();
    render(<ChessApp createEngine={engine.createEngine} />);
    await startGame(user, "White");
    await playMove(user, "e2", "e4");

    await user.click(square("d2"));

    expect(targetedSquares()).toEqual([]);
    expect(screen.getByText("Engine is thinking")).toBeInTheDocument();
  });

  it("plays a move by dragging a piece onto a legal square", async () => {
    const user = userEvent.setup();
    const engine = scriptedEngine(["e7e5"]);
    render(<ChessApp createEngine={engine.createEngine} />);
    await startGame(user, "White");
    // jsdom has no layout, so give the board a known 800px size to map pointer positions to squares.
    vi.spyOn(board(), "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 800 }),
    );

    fireEvent.pointerDown(square("e2"), { pointerId: 1, button: 0, clientX: 450, clientY: 650 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 450, clientY: 550 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 450, clientY: 450 });

    expect(square("e4")).toHaveAccessibleName("e4, white pawn");
    await waitFor(() => expect(engine.requests[0]?.moves).toEqual(["e2e4"]), ENGINE_WAIT);
  });

  it("snaps a dragged piece back when dropped on an illegal square", async () => {
    const user = userEvent.setup();
    render(<ChessApp createEngine={scriptedEngine([]).createEngine} />);
    await startGame(user, "White");
    vi.spyOn(board(), "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 800 }),
    );

    fireEvent.pointerDown(square("e2"), { pointerId: 1, button: 0, clientX: 450, clientY: 650 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 450, clientY: 400 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 450, clientY: 350 });

    expect(square("e2")).toHaveAccessibleName("e2, white pawn");
    expect(square("e5")).toHaveAccessibleName("e5");
  });
});

describe("promotion", () => {
  // 1.b4 h6 2.b5 h5 3.b6 h4 4.bxa7 h3, leaving the a7 pawn able to capture on b8.
  const reachPromotion = async (user: UserEvent, engine: FakeEngine): Promise<void> => {
    await startGame(user, "White");
    const humanMoves: [string, string][] = [
      ["b2", "b4"],
      ["b4", "b5"],
      ["b5", "b6"],
      ["b6", "a7"],
    ];
    for (const [index, [from, to]] of humanMoves.entries()) {
      await playMove(user, from, to);
      await waitFor(() => expect(engine.requests).toHaveLength(index + 1), ENGINE_WAIT);
      await screen.findByText("Your move", {}, ENGINE_WAIT);
    }
  };

  it("asks which piece to promote to and plays the choice", async () => {
    const user = userEvent.setup();
    const engine = scriptedEngine(["h7h6", "h6h5", "h5h4", "h4h3", "h3g2"]);
    render(<ChessApp createEngine={engine.createEngine} />);
    await reachPromotion(user, engine);

    await playMove(user, "a7", "b8");
    const picker = screen.getByRole("dialog", { name: "Promote pawn to" });
    await user.click(within(picker).getByRole("button", { name: "Knight" }));

    expect(square("b8")).toHaveAccessibleName("b8, white knight");
    await waitFor(() => expect(engine.requests.at(-1)?.moves.at(-1)).toBe("a7b8n"), ENGINE_WAIT);
  }, 15000);

  it("leaves the pawn in place when the promotion is cancelled", async () => {
    const user = userEvent.setup();
    const engine = scriptedEngine(["h7h6", "h6h5", "h5h4", "h4h3"]);
    render(<ChessApp createEngine={engine.createEngine} />);
    await reachPromotion(user, engine);

    await playMove(user, "a7", "b8");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(square("a7")).toHaveAccessibleName("a7, white pawn");
    expect(square("b8")).toHaveAccessibleName("b8, black knight");
  }, 15000);
});

describe("game over", () => {
  it("announces checkmate and keeps the board on screen", async () => {
    const user = userEvent.setup();
    const engine = scriptedEngine(["e7e5", "d8h4"]);
    render(<ChessApp createEngine={engine.createEngine} />);
    await startGame(user, "White");

    await playMove(user, "f2", "f3");
    await screen.findByRole("button", { name: "e5, black pawn" }, ENGINE_WAIT);
    await playMove(user, "g2", "g4");

    const banner = await screen.findByRole("alertdialog", { name: "Checkmate, you lose" }, ENGINE_WAIT);
    expect(within(banner).getByRole("button", { name: "New game" })).toBeInTheDocument();
    expect(board()).toBeInTheDocument();
    expect(square("e1")).toHaveAttribute("data-checked", "true");
  });

  it("confirms a resignation inline before ending the game", async () => {
    const user = userEvent.setup();
    render(<ChessApp createEngine={scriptedEngine([]).createEngine} />);
    await startGame(user, "White");

    await user.click(screen.getByRole("button", { name: "Resign" }));
    await user.click(screen.getByRole("button", { name: "Keep playing" }));
    expect(screen.queryByText("You resigned")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Resign" }));
    await user.click(screen.getByRole("button", { name: "Yes, resign" }));

    expect(screen.getByRole("alertdialog", { name: "You resigned" })).toBeInTheDocument();
  });

  it("returns to the setup screen for a new game", async () => {
    const user = userEvent.setup();
    render(<ChessApp createEngine={scriptedEngine([]).createEngine} />);
    await startGame(user, "White");

    await user.click(screen.getByRole("button", { name: "New game" }));

    expect(screen.getByRole("button", { name: "Start game" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Chess board" })).not.toBeInTheDocument();
  });
});

describe("side panel", () => {
  it("lists moves in numbered pairs", async () => {
    const user = userEvent.setup();
    render(<ChessApp createEngine={scriptedEngine(["e7e5"]).createEngine} />);
    await startGame(user, "White");

    await playMove(user, "e2", "e4");
    await screen.findByRole("button", { name: "e5, black pawn" }, ENGINE_WAIT);

    const moves = screen.getByRole("list", { name: "Moves" });
    expect(within(moves).getByRole("listitem")).toHaveTextContent(/1\.\s*e4\s*e5/);
  });

  it("flips the board on request", async () => {
    const user = userEvent.setup();
    render(<ChessApp createEngine={scriptedEngine([]).createEngine} />);
    await startGame(user, "White");

    await user.click(screen.getByRole("button", { name: "Flip board" }));

    expect(topLeftSquare()).toBe("h1, white rook");
  });

  it("shows an engine failure instead of waiting forever", async () => {
    const user = userEvent.setup();
    render(<ChessApp createEngine={scriptedEngine([]).createEngine} />);
    await startGame(user, "White");

    await playMove(user, "e2", "e4");

    expect(await screen.findByRole("alert", {}, ENGINE_WAIT)).toHaveTextContent("The engine failed to reply");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("shuts the engine down when the game is closed", async () => {
    const user = userEvent.setup();
    const engine = scriptedEngine(["e2e4"]);
    const { unmount } = render(<ChessApp createEngine={engine.createEngine} />);
    await startGame(user, "Black");
    await screen.findByRole("button", { name: "e4, white pawn" }, ENGINE_WAIT);

    unmount();

    expect(engine.terminate).toHaveBeenCalled();
  });
});
