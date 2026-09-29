import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountSavedGames, type SavedGamesPanel } from "./savedGames.ts";
import type { ShellHandle } from "./shell.ts";

const games = [
  { slug: "fable_5-1", label: "Fable 5.1" },
  { slug: "opus_5-5", label: "Opus 5.5" },
];

const summaryOne = {
  id: "g1",
  modelSlug: "opus_5-5",
  title: "Opus 5.5, 28 Sep 2026",
  result: "1-0",
  createdAt: "2026-09-28T12:00:00.000Z",
  updatedAt: "2026-09-28T12:00:00.000Z",
};
const summaryTwo = { ...summaryOne, id: "g2", modelSlug: "fable_5-1", title: "Fable game", result: "*" };

const user = { id: "u1", name: "Ada Lovelace" };

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const problemResponse = (status: number): Response =>
  new Response(JSON.stringify({ title: "Problem", status }), {
    status,
    headers: { "content-type": "application/problem+json" },
  });

const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

interface GameScript {
  silent: boolean;
  stateReply: { state: unknown; summary: unknown };
  loadReply: { ok: boolean; error?: string };
}

interface Harness {
  container: HTMLElement;
  frame: HTMLIFrameElement;
  posted: Array<Record<string, unknown>>;
  script: GameScript;
  selected: { slug: string };
  navigate: ReturnType<typeof vi.fn>;
  fetcher: ReturnType<typeof vi.fn>;
  panel: SavedGamesPanel;
  notifySelection: (slug: string) => void;
}

let harness: Harness;

const fromGame = (message: Record<string, unknown>): void => {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { source: "claude-chess-game", ...message },
      origin: window.location.origin,
      source: harness.frame.contentWindow,
    }),
  );
};

type Route = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

const setup = (route: Route, selectedSlug = "opus_5-5"): Harness => {
  document.body.replaceChildren();
  const container = document.createElement("div");
  const frame = document.createElement("iframe");
  document.body.append(container, frame);

  const posted: Array<Record<string, unknown>> = [];
  const script: GameScript = {
    silent: false,
    stateReply: { state: { fen: "start" }, summary: { result: "*", moveCount: 4 } },
    loadReply: { ok: true },
  };
  const selected = { slug: selectedSlug };
  const listeners = new Set<(slug: string) => void>();
  const notifySelection = (slug: string): void => {
    selected.slug = slug;
    for (const listener of listeners) listener(slug);
  };

  (frame.contentWindow as Window).postMessage = ((message: Record<string, unknown>): void => {
    posted.push(message);
    if (script.silent) return;
    queueMicrotask(() => {
      if (message.type === "ping") fromGame({ type: "ready" });
      if (message.type === "request-state") fromGame({ type: "state", requestId: message.requestId, ...script.stateReply });
      if (message.type === "load-state") fromGame({ type: "loaded", requestId: message.requestId, ...script.loadReply });
    });
  }) as Window["postMessage"]; // Test double that records and answers like a game.

  const shell: Pick<ShellHandle, "frame" | "games" | "getSelectedSlug" | "onSelectionChange"> = {
    frame,
    games,
    getSelectedSlug: () => selected.slug,
    onSelectionChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const navigate = vi.fn((slug: string): void => {
    notifySelection(slug);
    setTimeout(() => frame.dispatchEvent(new Event("load")), 0);
  });
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => route(String(input), init));

  const panel = mountSavedGames(container, {
    fetcher: fetcher as unknown as typeof fetch, // vi.fn mock with a compatible call signature.
    shell,
    navigate,
    now: () => new Date("2026-09-29T10:00:00.000Z"),
    bridgeTimeoutMs: 30,
    frameLoadTimeoutMs: 60,
  });
  harness = { container, frame, posted, script, selected, navigate, fetcher, panel, notifySelection };
  return harness;
};

const buttonLabelled = (label: string): HTMLButtonElement => {
  const match = [...harness.container.querySelectorAll("button")].find((button) => button.textContent === label);
  if (match === undefined) {
    throw new Error(`No button labelled "${label}"; found: ${harness.container.textContent}`);
  }
  return match;
};

const hasButton = (label: string): boolean =>
  [...harness.container.querySelectorAll("button")].some((button) => button.textContent === label);

const alertText = (): string | undefined => harness.container.querySelector('[role="alert"]')?.textContent ?? undefined;
const statusText = (): string | undefined => harness.container.querySelector('[role="status"]')?.textContent ?? undefined;

const listRoute = (items: unknown[] = [summaryOne, summaryTwo]): Route => (url, init) => {
  if (url === "/api/games" && (init?.method ?? "GET") === "GET") return jsonResponse(items);
  return problemResponse(500);
};

const openPanel = async (): Promise<void> => {
  harness.panel.setUser(user);
  buttonLabelled("Saved games").click();
  await flush();
};

const callsTo = (method: string, url: string): number =>
  harness.fetcher.mock.calls.filter(([input, init]) => input === url && ((init as RequestInit | undefined)?.method ?? "GET") === method)
    .length;

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("signed-out state", () => {
  it("shows a sign-in hint instead of the panel toggle", () => {
    setup(listRoute());
    expect(harness.container.textContent).toContain("Sign in to save games");
    expect(hasButton("Saved games")).toBe(false);
  });

  it("reacts to session changes in both directions and closes the panel on sign-out", async () => {
    setup(listRoute());
    harness.panel.setUser(user);
    expect(hasButton("Saved games")).toBe(true);
    expect(harness.container.textContent).not.toContain("Sign in to save games");

    buttonLabelled("Saved games").click();
    await flush();
    expect(hasButton("Save game")).toBe(true);

    harness.panel.setUser(null);
    expect(hasButton("Save game")).toBe(false);
    expect(harness.container.textContent).toContain("Sign in to save games");
  });
});

describe("panel toggle", () => {
  it("toggles aria-expanded, closes on Escape and returns focus to the toggle", async () => {
    setup(listRoute());
    harness.panel.setUser(user);
    const toggle = buttonLabelled("Saved games");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    toggle.click();
    await flush();
    expect(buttonLabelled("Saved games").getAttribute("aria-expanded")).toBe("true");

    buttonLabelled("Save game").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(hasButton("Save game")).toBe(false);
    expect(buttonLabelled("Saved games").getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(buttonLabelled("Saved games"));
  });
});

describe("listing", () => {
  it("lists saved games with title, model label, result and date using the session cookie", async () => {
    setup(listRoute());
    await openPanel();

    const [url, init] = harness.fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/games");
    expect(init.credentials).toBe("same-origin");

    const items = harness.container.querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Opus 5.5, 28 Sep 2026");
    expect(items[0].textContent).toContain("Opus 5.5");
    expect(items[0].textContent).toContain("1-0");
    expect(items[0].textContent).toContain("28 Sep 2026");
    expect(items[1].textContent).toContain("Fable 5.1");
    expect(items[1].textContent).toContain("In progress");
  });

  it("shows an empty message when nothing is saved", async () => {
    setup(listRoute([]));
    await openPanel();
    expect(harness.container.textContent).toContain("No saved games yet");
  });

  it("renders titles as text, never as markup", async () => {
    setup(listRoute([{ ...summaryOne, title: '<img src=x onerror="alert(1)">' }]));
    await openPanel();
    expect(harness.container.querySelector("img")).toBeNull();
    expect(harness.container.querySelector("li")?.textContent).toContain("<img");
  });

  it("shows a sign-in message when the list request is unauthorised", async () => {
    setup(() => problemResponse(401));
    await openPanel();
    expect(alertText()).toMatch(/sign in/i);
  });

  it("shows a network error message when the list request cannot reach the server", async () => {
    setup(() => Promise.reject(new TypeError("Failed to fetch")));
    await openPanel();
    expect(alertText()).toMatch(/could not reach the server/i);
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("saving", () => {
  const saveRoute = (post: Route): Route => (url, init) => {
    if (init?.method === "POST") return post(url, init);
    return listRoute()(url, init);
  };

  it("asks the game for its state, offers an editable default title and posts the game", async () => {
    setup(saveRoute(() => jsonResponse({ ...summaryOne, id: "g3", state: {} }, 201)));
    harness.script.stateReply = { state: { fen: "mid" }, summary: { result: "1/2-1/2", moveCount: 40 } };
    await openPanel();

    buttonLabelled("Save game").click();
    await flush();

    const input = harness.container.querySelector<HTMLInputElement>("input");
    expect(input?.value).toBe("Opus 5.5, 29 Sep 2026");
    expect(harness.container.querySelector("label")?.textContent).toBe("Title");
    expect(harness.posted.map((message) => message.type)).toEqual(["ping", "request-state"]);

    (input as HTMLInputElement).value = "My endgame"; // Asserted non-null on the line above.
    input?.dispatchEvent(new Event("input", { bubbles: true }));
    buttonLabelled("Confirm save").click();
    await flush();

    const postCall = harness.fetcher.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    const [url, init] = postCall as [string, RequestInit];
    expect(url).toBe("/api/games");
    expect(JSON.parse(init.body as string)).toEqual({
      modelSlug: "opus_5-5",
      title: "My endgame",
      result: "1/2-1/2",
      state: { fen: "mid" },
    });
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(statusText()).toMatch(/saved/i);
    expect(callsTo("GET", "/api/games")).toBe(2);
    expect(harness.container.querySelector("input")).toBeNull();
  });

  it("says so when the game has nothing to save", async () => {
    setup(saveRoute(() => jsonResponse({}, 201)));
    harness.script.stateReply = { state: null, summary: null };
    await openPanel();

    buttonLabelled("Save game").click();
    await flush();

    expect(statusText()).toMatch(/nothing to save/i);
    expect(harness.container.querySelector("input")).toBeNull();
  });

  it("can cancel the title form without saving", async () => {
    setup(saveRoute(() => jsonResponse({}, 201)));
    await openPanel();
    buttonLabelled("Save game").click();
    await flush();
    buttonLabelled("Cancel").click();
    expect(harness.container.querySelector("input")).toBeNull();
    expect(callsTo("POST", "/api/games")).toBe(0);
  });

  it.each([
    [401, /sign in/i],
    [413, /too large/i],
    [500, /status 500/i],
  ])("shows a clear error for a %i response", async (status, pattern) => {
    setup(saveRoute(() => problemResponse(status)));
    await openPanel();
    buttonLabelled("Save game").click();
    await flush();
    buttonLabelled("Confirm save").click();
    await flush();
    expect(alertText()).toMatch(pattern);
  });

  it("shows a network error and keeps the title form so the user can retry", async () => {
    setup(saveRoute(() => Promise.reject(new TypeError("Failed to fetch"))));
    await openPanel();
    buttonLabelled("Save game").click();
    await flush();
    buttonLabelled("Confirm save").click();
    await flush();
    expect(alertText()).toMatch(/could not reach the server/i);
    expect(hasButton("Confirm save")).toBe(true);
    expect(consoleError).toHaveBeenCalled();
  });

  it("reports a game that does not answer the bridge", async () => {
    setup(saveRoute(() => jsonResponse({}, 201)));
    harness.script.silent = true;
    await openPanel();
    buttonLabelled("Save game").click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(alertText()).toMatch(/did not respond/i);
    expect(consoleError).toHaveBeenCalled();
  });

  it("rejects an empty title without calling the server", async () => {
    setup(saveRoute(() => jsonResponse({}, 201)));
    await openPanel();
    buttonLabelled("Save game").click();
    await flush();
    const input = harness.container.querySelector<HTMLInputElement>("input") as HTMLInputElement; // Form is open after the click above.
    input.value = "   ";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    buttonLabelled("Confirm save").click();
    await flush();
    expect(alertText()).toMatch(/title/i);
    expect(callsTo("POST", "/api/games")).toBe(0);
  });

  it("drops a pending save when another game is selected", async () => {
    setup(saveRoute(() => jsonResponse({}, 201)));
    await openPanel();
    buttonLabelled("Save game").click();
    await flush();
    harness.notifySelection("fable_5-1");
    expect(harness.container.querySelector("input")).toBeNull();
  });
});

describe("deleting", () => {
  const deleteRoute = (remove: Route): Route => (url, init) => {
    if (init?.method === "DELETE") return remove(url, init);
    return listRoute()(url, init);
  };

  it("asks for confirmation before deleting, then deletes and refreshes the list", async () => {
    setup(deleteRoute(() => new Response(null, { status: 204 })));
    await openPanel();

    harness.container.querySelectorAll<HTMLButtonElement>("li button")[1].click();
    expect(callsTo("DELETE", "/api/games/g1")).toBe(0);
    expect(harness.container.textContent).toContain("Delete");

    buttonLabelled("Confirm delete").click();
    await flush();

    expect(callsTo("DELETE", "/api/games/g1")).toBe(1);
    expect(callsTo("GET", "/api/games")).toBe(2);
    expect(statusText()).toMatch(/deleted/i);
  });

  it("does nothing when the confirmation is cancelled", async () => {
    setup(deleteRoute(() => new Response(null, { status: 204 })));
    await openPanel();
    harness.container.querySelectorAll<HTMLButtonElement>("li button")[1].click();
    buttonLabelled("Cancel").click();
    expect(hasButton("Confirm delete")).toBe(false);
    expect(callsTo("DELETE", "/api/games/g1")).toBe(0);
  });

  it("shows an error when the delete fails", async () => {
    setup(deleteRoute(() => problemResponse(401)));
    await openPanel();
    harness.container.querySelectorAll<HTMLButtonElement>("li button")[1].click();
    buttonLabelled("Confirm delete").click();
    await flush();
    expect(alertText()).toMatch(/sign in/i);
  });
});

describe("loading", () => {
  const detail = (summary: typeof summaryOne): Response => jsonResponse({ ...summary, state: { fen: "saved" } });

  const loadRoute: Route = (url, init) => {
    if (url === "/api/games/g1") return detail(summaryOne);
    if (url === "/api/games/g2") return detail(summaryTwo);
    return listRoute()(url, init);
  };

  const clickLoad = async (index: number): Promise<void> => {
    harness.container.querySelectorAll<HTMLButtonElement>("li button")[index * 2].click();
    await flush();
  };

  it("sends load-state straight away when the saved game is the current model", async () => {
    setup(loadRoute);
    await openPanel();
    await clickLoad(0);

    expect(harness.navigate).not.toHaveBeenCalled();
    const loadMessage = harness.posted.find((message) => message.type === "load-state");
    expect(loadMessage?.state).toEqual({ fen: "saved" });
    expect(statusText()).toMatch(/loaded/i);
    expect(callsTo("GET", "/api/games/g1")).toBe(1);
  });

  it("switches game by hash, waits for the frame and readiness, then loads", async () => {
    setup(loadRoute, "opus_5-5");
    await openPanel();
    await clickLoad(1);

    expect(harness.navigate).toHaveBeenCalledWith("fable_5-1");
    const types = harness.posted.map((message) => message.type);
    expect(types).toContain("ping");
    expect(types.indexOf("load-state")).toBeGreaterThan(types.indexOf("ping"));
    expect(statusText()).toMatch(/loaded/i);
  });

  it("uses the location hash by default when switching game", async () => {
    window.location.hash = "";
    document.body.replaceChildren();
    const container = document.createElement("div");
    document.body.append(container);
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const panel = mountSavedGames(container, {
      fetcher: (async (input: RequestInfo | URL) =>
        String(input) === "/api/games" ? jsonResponse([summaryTwo]) : detail(summaryTwo)) as typeof fetch, // Minimal stub routed by URL.
      shell: { frame, games, getSelectedSlug: () => "opus_5-5", onSelectionChange: () => () => undefined },
      frameLoadTimeoutMs: 10,
    });
    panel.setUser(user);
    container.querySelector<HTMLButtonElement>("button")?.click();
    await flush();
    container.querySelectorAll<HTMLButtonElement>("li button")[0].click();
    await flush();
    expect(window.location.hash).toBe("#fable_5-1");
  });

  it("shows the game's own error text when it rejects the state", async () => {
    setup(loadRoute);
    harness.script.loadReply = { ok: false, error: "Illegal move at ply 4" };
    await openPanel();
    await clickLoad(0);
    expect(alertText()).toContain("Illegal move at ply 4");
  });

  it("shows a message and does not switch when the game folder no longer exists", async () => {
    setup(loadRoute);
    const retired = { ...summaryOne, modelSlug: "retired_1-0" };
    harness.fetcher.mockImplementation(async (input: RequestInfo | URL) =>
      String(input) === "/api/games" ? jsonResponse([retired]) : detail(retired),
    );
    await openPanel();
    await clickLoad(0);
    expect(alertText()).toMatch(/no longer available/i);
    expect(harness.navigate).not.toHaveBeenCalled();
    expect(callsTo("GET", "/api/games/g1")).toBe(0);
  });

  it("reports a failed download of the saved game and leaves the current game alone", async () => {
    setup((url, init) => (url === "/api/games/g2" ? problemResponse(404) : listRoute()(url, init)), "opus_5-5");
    await openPanel();
    await clickLoad(1);
    expect(alertText()).toMatch(/could not load/i);
    expect(harness.navigate).not.toHaveBeenCalled();
    expect(harness.posted.some((message) => message.type === "load-state")).toBe(false);
  });

  it("reports a network failure while fetching the saved game", async () => {
    setup((url, init) => (url === "/api/games/g1" ? Promise.reject(new TypeError("Failed to fetch")) : listRoute()(url, init)));
    await openPanel();
    await clickLoad(0);
    expect(alertText()).toMatch(/could not reach the server/i);
  });

  it("reports when the game page never finishes loading after a switch", async () => {
    setup(loadRoute, "opus_5-5");
    harness.navigate.mockImplementation((slug: string) => harness.notifySelection(slug)); // Never fires the frame load event.
    await openPanel();
    harness.container.querySelectorAll<HTMLButtonElement>("li button")[2].click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(alertText()).toMatch(/finish loading/i);
  });
});
