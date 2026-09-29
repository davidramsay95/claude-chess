export interface GameSummary {
  slug: string;
  label: string;
}

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
  title.textContent = "Claude Chess";
  const tabList = document.createElement("div");
  tabList.setAttribute("role", "tablist");
  tabList.setAttribute("aria-label", "Choose a model to play against");
  const accountSlot = document.createElement("div");
  accountSlot.className = "account";
  const savedGamesSlot = document.createElement("div");
  savedGamesSlot.className = "saved-games";
  header.append(title, tabList, savedGamesSlot, accountSlot);

  const frame = document.createElement("iframe");
  frame.className = "game";
  frame.title = "Chess game";
  frame.setAttribute("allow", "clipboard-write");

  const tabs = new Map<string, HTMLButtonElement>();

  const listeners = new Set<(slug: string) => void>();
  let selectedSlug = games[0].slug;

  const select = (slug: string): void => {
    for (const [tabSlug, tab] of tabs) {
      tab.setAttribute("aria-selected", String(tabSlug === slug));
      tab.tabIndex = tabSlug === slug ? 0 : -1;
    }
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

  for (const game of games) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.setAttribute("role", "tab");
    tab.textContent = game.label;
    tab.addEventListener("click", () => {
      window.location.hash = game.slug;
      select(game.slug);
    });
    tabs.set(game.slug, tab);
    tabList.append(tab);
  }

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
