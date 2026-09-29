import type { SessionUser } from "./account.ts";
import { DEFAULT_BRIDGE_TIMEOUT_MS, DEFAULT_FRAME_LOAD_TIMEOUT_MS, loadState, requestState, waitForFrameLoad, waitForReady } from "./gameBridge.ts";
import type { GameResult } from "./gameBridge.ts";
import type { ShellHandle } from "./shell.ts";

export interface SavedGamesOptions {
  fetcher?: typeof fetch;
  shell: Pick<ShellHandle, "frame" | "games" | "getSelectedSlug" | "onSelectionChange">;
  /** Switches the shell to another game. Defaults to setting the location hash, which the shell already routes on. */
  navigate?: (slug: string) => void;
  now?: () => Date;
  bridgeTimeoutMs?: number;
  frameLoadTimeoutMs?: number;
}

export interface SavedGamesPanel {
  /** Tells the panel who is signed in, or null when nobody is. */
  setUser: (user: SessionUser | null) => void;
}

interface SavedGameSummary {
  id: string;
  modelSlug: string;
  title: string;
  result: GameResult | null;
  createdAt: string;
  updatedAt: string;
}

interface PendingSave {
  slug: string;
  state: unknown;
  result: GameResult;
  title: string;
}

interface Message {
  kind: "error" | "success" | "info";
  text: string;
}

type ListState = { status: "idle" | "loading" } | { status: "ready"; items: SavedGameSummary[] };

const PANEL_ID = "saved-games-panel";
const MAX_TITLE_LENGTH = 100;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const NETWORK_MESSAGE = "Could not reach the server. Check your connection and try again.";

/** Formats as "29 Sep 2026". Written by hand because Intl month names differ between locales and ICU versions. */
const formatDate = (date: Date): string => `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;

const formatResult = (result: string | null): string => {
  if (result === null) return "";
  return result === "*" ? "In progress" : result;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isSummary = (value: unknown): value is SavedGameSummary =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.modelSlug === "string" &&
  typeof value.title === "string" &&
  typeof value.updatedAt === "string";

const describeFailure = (action: string, status: number): string => {
  if (status === 401) return "Your session has expired. Sign in again to use saved games.";
  if (status === 413) return "This game is too large to save. The limit is 256 KiB.";
  return `Could not ${action} (status ${status}).`;
};

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const button = (label: string, focusKey: string, onClick: () => void, disabled = false): HTMLButtonElement => {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.disabled = disabled;
  element.dataset.focus = focusKey;
  element.addEventListener("click", onClick);
  return element;
};

/** Renders the saved games dropdown: save the current game, list, load and delete saved games. */
export const mountSavedGames = (
  container: HTMLElement,
  {
    fetcher = fetch.bind(globalThis),
    shell,
    navigate = (slug) => {
      window.location.hash = slug;
    },
    now = () => new Date(),
    bridgeTimeoutMs = DEFAULT_BRIDGE_TIMEOUT_MS,
    frameLoadTimeoutMs = DEFAULT_FRAME_LOAD_TIMEOUT_MS,
  }: SavedGamesOptions,
): SavedGamesPanel => {
  let user: SessionUser | null = null;
  let open = false;
  let busy = false;
  let list: ListState = { status: "idle" };
  let pending: PendingSave | null = null;
  let message: Message | null = null;
  let confirmingDeleteId: string | null = null;
  let listRequestCount = 0;

  const labelFor = (slug: string): string => shell.games.find((game) => game.slug === slug)?.label ?? slug;

  /** Wraps fetch so callers only see errors that are already fit to show the user. */
  const request = async (action: string, url: string, init: RequestInit = {}): Promise<Response> => {
    let response: Response;
    try {
      response = await fetcher(url, { credentials: "same-origin", ...init });
    } catch (error) {
      console.error(`Could not ${action}`, error);
      throw new Error(NETWORK_MESSAGE);
    }
    if (!response.ok) {
      console.error(`Could not ${action}: ${response.status} from ${url}`);
      throw new Error(describeFailure(action, response.status));
    }
    return response;
  };

  const fail = (error: unknown): void => {
    console.error("Saved games action failed", error);
    message = { kind: "error", text: errorText(error) };
  };

  const createMessage = (): HTMLElement => {
    const element = document.createElement("p");
    element.className = `saved-message saved-message-${message?.kind ?? "info"}`;
    element.setAttribute("role", message?.kind === "error" ? "alert" : "status");
    element.textContent = message?.text ?? "";
    return element;
  };

  const createSaveControls = (): HTMLElement => {
    if (pending === null) {
      return button("Save game", "save", () => void startSave(), busy);
    }
    const form = document.createElement("form");
    form.className = "saved-form";
    const label = document.createElement("label");
    label.htmlFor = "saved-games-title";
    label.textContent = "Title";
    const input = document.createElement("input");
    input.id = "saved-games-title";
    input.type = "text";
    input.maxLength = MAX_TITLE_LENGTH;
    input.value = pending.title;
    input.dataset.focus = "title";
    input.addEventListener("input", () => {
      if (pending !== null) pending.title = input.value;
    });
    const confirm = document.createElement("button");
    confirm.type = "submit";
    confirm.textContent = "Confirm save";
    confirm.disabled = busy;
    confirm.dataset.focus = "confirm-save";
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void confirmSave();
    });
    form.append(
      label,
      input,
      confirm,
      button("Cancel", "cancel-save", () => {
        pending = null;
        message = null;
        render("save");
      }),
    );
    return form;
  };

  const createItem = (item: SavedGameSummary): HTMLElement => {
    const row = document.createElement("li");
    const text = document.createElement("div");
    text.className = "saved-item-text";
    const title = document.createElement("span");
    title.className = "saved-title";
    title.textContent = item.title;
    const meta = document.createElement("span");
    meta.className = "saved-meta";
    const updated = new Date(item.updatedAt);
    const parts = [labelFor(item.modelSlug), formatResult(item.result), Number.isNaN(updated.getTime()) ? "" : formatDate(updated)];
    meta.textContent = parts.filter((part) => part !== "").join(" · ");
    text.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "saved-item-actions";
    if (confirmingDeleteId === item.id) {
      const question = document.createElement("span");
      question.className = "saved-confirm-text";
      question.textContent = "Delete this game?";
      actions.append(
        question,
        button("Confirm delete", `confirm-delete-${item.id}`, () => void deleteGame(item), busy),
        button("Cancel", `cancel-delete-${item.id}`, () => {
          confirmingDeleteId = null;
          render(`delete-${item.id}`);
        }),
      );
    } else {
      const load = button("Load", `load-${item.id}`, () => void loadGame(item), busy);
      load.setAttribute("aria-label", `Load ${item.title}`);
      const remove = button("Delete", `delete-${item.id}`, () => {
        confirmingDeleteId = item.id;
        message = null;
        render(`cancel-delete-${item.id}`);
      }, busy);
      remove.setAttribute("aria-label", `Delete ${item.title}`);
      actions.append(load, remove);
    }
    row.append(text, actions);
    return row;
  };

  const createList = (): HTMLElement => {
    if (list.status !== "ready") {
      const loading = document.createElement("p");
      loading.className = "saved-empty";
      loading.textContent = "Loading saved games";
      return loading;
    }
    if (list.items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "saved-empty";
      empty.textContent = "No saved games yet.";
      return empty;
    }
    const items = document.createElement("ul");
    items.className = "saved-list";
    items.append(...list.items.map(createItem));
    return items;
  };

  const createPanel = (): HTMLElement => {
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.className = "saved-panel";
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", "Saved games");
    panel.append(createSaveControls());
    if (message !== null) panel.append(createMessage());
    panel.append(createList());
    return panel;
  };

  /** Rebuilds the DOM, then restores focus so keyboard users do not lose their place. */
  const render = (focusKey?: string): void => {
    const active = document.activeElement;
    const previousKey = active instanceof HTMLElement && container.contains(active) ? (active.dataset.focus ?? null) : null;

    if (user === null) {
      const hint = document.createElement("span");
      hint.className = "saved-hint";
      hint.textContent = "Sign in to save games";
      container.replaceChildren(hint);
      return;
    }

    const toggle = button("Saved games", "toggle", () => {
      open = !open;
      message = null;
      if (open) {
        render("save");
        void refreshList();
      } else {
        render("toggle");
      }
    });
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-controls", PANEL_ID);
    container.replaceChildren(...(open ? [toggle, createPanel()] : [toggle]));

    const target = focusKey ?? previousKey;
    if (target !== null) {
      const element = container.querySelector<HTMLElement>(`[data-focus="${target}"]`);
      element?.focus();
      if (element instanceof HTMLInputElement) element.setSelectionRange(element.value.length, element.value.length);
    }
  };

  const refreshList = async (): Promise<void> => {
    const requestNumber = ++listRequestCount;
    if (list.status !== "ready") list = { status: "loading" };
    render();
    try {
      const response = await request("load your saved games", "/api/games");
      const body: unknown = await response.json();
      if (!Array.isArray(body) || !body.every(isSummary)) {
        throw new Error("The server sent a list of saved games that could not be read.");
      }
      if (requestNumber === listRequestCount) list = { status: "ready", items: body };
    } catch (error) {
      if (requestNumber === listRequestCount) {
        list = { status: "ready", items: [] };
        fail(error);
      }
    }
    if (requestNumber === listRequestCount) render();
  };

  const startSave = async (): Promise<void> => {
    busy = true;
    message = null;
    render();
    try {
      await waitForReady(shell.frame, { timeoutMs: bridgeTimeoutMs });
      const reply = await requestState(shell.frame, { timeoutMs: bridgeTimeoutMs });
      if (reply === null) {
        message = { kind: "info", text: "This game has nothing to save yet. Make a move first." };
      } else {
        const slug = shell.getSelectedSlug();
        pending = {
          slug,
          state: reply.state,
          result: reply.summary.result,
          title: `${labelFor(slug)}, ${formatDate(now())}`.slice(0, MAX_TITLE_LENGTH),
        };
      }
    } catch (error) {
      fail(error);
    }
    busy = false;
    render(pending === null ? "save" : "title");
  };

  const confirmSave = async (): Promise<void> => {
    if (pending === null) return;
    const title = pending.title.trim();
    if (title === "" || title.length > MAX_TITLE_LENGTH) {
      message = { kind: "error", text: `Enter a title between 1 and ${MAX_TITLE_LENGTH} characters.` };
      render("title");
      return;
    }
    busy = true;
    message = null;
    render();
    try {
      await request("save the game", "/api/games", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modelSlug: pending.slug, title, result: pending.result, state: pending.state }),
      });
      pending = null;
      message = { kind: "success", text: `Saved "${title}".` };
    } catch (error) {
      fail(error);
    }
    busy = false;
    render(pending === null ? "save" : "title");
    if (pending === null) await refreshList();
  };

  const deleteGame = async (item: SavedGameSummary): Promise<void> => {
    busy = true;
    message = null;
    render();
    try {
      await request("delete the game", `/api/games/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      message = { kind: "success", text: `Deleted "${item.title}".` };
    } catch (error) {
      fail(error);
    }
    confirmingDeleteId = null;
    busy = false;
    render("save");
    await refreshList();
  };

  const switchToGame = async (slug: string): Promise<void> => {
    // Listen before navigating, otherwise a fast load event could be missed.
    const loaded = waitForFrameLoad(shell.frame, { timeoutMs: frameLoadTimeoutMs });
    navigate(slug);
    await loaded;
  };

  const loadGame = async (item: SavedGameSummary): Promise<void> => {
    if (!shell.games.some((game) => game.slug === item.modelSlug)) {
      message = { kind: "error", text: `The game "${item.modelSlug}" is no longer available, so this save cannot be loaded.` };
      render();
      return;
    }
    busy = true;
    message = { kind: "info", text: `Loading "${item.title}"` };
    render();
    try {
      // Fetching first means a failed download leaves the player on the game they were in.
      const response = await request("load the saved game", `/api/games/${encodeURIComponent(item.id)}`);
      const detail: unknown = await response.json();
      if (!isRecord(detail) || !("state" in detail)) {
        throw new Error("The server sent a saved game that could not be read.");
      }
      if (shell.getSelectedSlug() !== item.modelSlug) {
        await switchToGame(item.modelSlug);
      }
      await waitForReady(shell.frame, { timeoutMs: bridgeTimeoutMs });
      await loadState(shell.frame, detail.state, { timeoutMs: bridgeTimeoutMs });
      message = { kind: "success", text: `Loaded "${item.title}".` };
    } catch (error) {
      fail(error);
    }
    busy = false;
    render();
  };

  container.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && open) {
      open = false;
      render("toggle");
    }
  });

  // A pending save belongs to the game it was taken from, so a tab switch invalidates it.
  shell.onSelectionChange(() => {
    if (pending !== null) {
      pending = null;
      render();
    }
  });

  render();

  return {
    setUser: (next) => {
      user = next;
      if (next === null) {
        open = false;
        list = { status: "idle" };
        pending = null;
        message = null;
        confirmingDeleteId = null;
        listRequestCount++;
      }
      render();
    },
  };
};
