import { gameName, type GameSummary } from "./gameSummary.ts";

export interface ModelSelectorOptions {
  games: readonly GameSummary[];
  selectedSlug: string;
  onSelect: (slug: string) => void;
}

export interface ModelSelectorHandle {
  element: HTMLElement;
  /** Updates the displayed selection without calling onSelect. */
  setSelected: (slug: string) => void;
}

let nextId = 0;

const createElement = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
};

/**
 * Builds the model picker: it shows the selected model and version, and reveals the full list on mouse
 * hover or when the trigger is clicked. Touch pointers never count as hover, so a tap opens it once.
 */
export const mountModelSelector = ({ games, selectedSlug, onSelect }: ModelSelectorOptions): ModelSelectorHandle => {
  const listId = `model-select-list-${nextId++}`;
  let selected = games.find((game) => game.slug === selectedSlug) ?? games[0];
  let hovered = false;
  let pinned = false;

  const element = createElement("div", "model-select");
  const trigger = createElement("button", "model-select-trigger");
  trigger.type = "button";
  trigger.setAttribute("aria-controls", listId);
  const triggerName = createElement("span", "model-select-name");
  const chevron = createElement("span", "model-select-chevron");
  chevron.setAttribute("aria-hidden", "true");
  trigger.append(triggerName, chevron);

  const list = createElement("ul", "model-select-list");
  list.id = listId;
  const optionBySlug = new Map<string, HTMLButtonElement>();
  for (const game of games) {
    const option = createElement("button", "model-select-option");
    option.type = "button";
    option.append(createElement("span", "model-select-option-name", gameName(game)));
    if (game.date) {
      option.append(createElement("span", "model-select-date", game.date));
    }
    option.addEventListener("click", () => {
      const changed = game.slug !== selected.slug;
      setSelected(game.slug);
      close();
      if (changed) {
        onSelect(game.slug);
      }
    });
    optionBySlug.set(game.slug, option);
    const item = document.createElement("li");
    item.append(option);
    list.append(item);
  }

  const render = (): void => {
    const open = hovered || pinned;
    trigger.setAttribute("aria-expanded", String(open));
    trigger.setAttribute("aria-label", `Choose a model, currently ${gameName(selected)}`);
    list.hidden = !open;
    element.classList.toggle("open", open);
    triggerName.textContent = gameName(selected);
    for (const [slug, option] of optionBySlug) {
      if (slug === selected.slug) {
        option.setAttribute("aria-current", "true");
      } else {
        option.removeAttribute("aria-current");
      }
    }
  };

  const close = (): void => {
    hovered = false;
    pinned = false;
    render();
  };

  const setSelected = (slug: string): void => {
    selected = games.find((game) => game.slug === slug) ?? selected;
    render();
  };

  trigger.addEventListener("click", () => {
    if (pinned) {
      close();
      return;
    }
    pinned = true;
    render();
  });

  element.addEventListener("pointerenter", (event) => {
    if ((event as PointerEvent).pointerType === "mouse") {
      hovered = true;
      render();
    }
  });
  element.addEventListener("pointerleave", () => {
    hovered = false;
    render();
  });
  element.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      close();
      trigger.focus();
    }
  });
  element.addEventListener("focusout", (event) => {
    if (!element.contains(event.relatedTarget as Node | null)) { // relatedTarget is null when focus leaves the page.
      pinned = false;
      render();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!element.contains(event.target as Node | null)) {
      close();
    }
  });

  element.append(trigger, list);
  render();
  return { element, setSelected };
};
