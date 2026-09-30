import type { GameSummary } from "./gameSummary.ts";
import { mountModelSelector } from "./modelSelector.ts";

/** Picks the game named in the URL hash, defaulting to the first game. */
export const resolveSelectedSlug = (hash: string, games: readonly GameSummary[]): string | null => {
  const requested = hash.replace(/^#/, "");
  const match = games.find((game) => game.slug === requested);
  return match?.slug ?? games[0]?.slug ?? null;
};

/** What other modules need from the mounted shell: the frame, the games and selection changes. */
export interface ShellHandle {
  frame: HTMLIFrameElement;
  games: readonly GameSummary[];
  getSelectedSlug: () => string;
  /** Subscribes to selection changes; returns the unsubscribe function. */
  onSelectionChange: (listener: (slug: string) => void) => () => void;
}

const gameUrl = (slug: string): string => `/play/${slug}/`;

/** Renders the game switcher and the frame that hosts the selected game. Returns null when there are no games. */
export const mountShell = (root: HTMLElement, games: readonly GameSummary[]): ShellHandle | null => {
  root.replaceChildren();

  if (games.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No games are available yet.";
    root.append(empty);
    return null;
  }

  const header = document.createElement("header");
  header.className = "bar";
  const title = document.createElement("h1");
  const homeLink = document.createElement("a");
  homeLink.href = "/";
  homeLink.textContent = "Claude Chess";
  title.append(homeLink);
  // select is defined below; the callback only runs after mounting, so the reference is safe.
  const modelSelector = mountModelSelector({
    games,
    selectedSlug: games[0].slug,
    onSelect: (slug) => {
      window.location.hash = slug;
      select(slug);
    },
  });
  const accountSlot = document.createElement("div");
  accountSlot.className = "account";
  const savedGamesSlot = document.createElement("div");
  savedGamesSlot.className = "saved-games";
  header.append(title, modelSelector.element, savedGamesSlot, accountSlot);

  const frame = document.createElement("iframe");
  frame.className = "game";
  frame.title = "Chess game";
  frame.setAttribute("allow", "clipboard-write");

  const listeners = new Set<(slug: string) => void>();
  let selectedSlug = games[0].slug;

  const select = (slug: string): void => {
    modelSelector.setSelected(slug);
    const nextUrl = gameUrl(slug);
    if (frame.getAttribute("src") !== nextUrl) {
      frame.setAttribute("src", nextUrl);
    }
    if (slug !== selectedSlug) {
      selectedSlug = slug;
      for (const listener of listeners) {
        listener(slug);
      }
    }
  };

  root.append(header, frame);

  const selectFromHash = (): void => {
    const slug = resolveSelectedSlug(window.location.hash, games);
    if (slug !== null) {
      select(slug);
    }
  };
  window.addEventListener("hashchange", selectFromHash);
  selectFromHash();

  return {
    frame,
    games,
    getSelectedSlug: () => selectedSlug,
    onSelectionChange: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
