import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameSummary } from "./gameSummary.ts";
import { mountShell, resolveSelectedSlug } from "./shell.ts";

const games: GameSummary[] = [
  { slug: "fable_5-1", label: "Fable 5.1", date: null },
  { slug: "opus_5-5", label: "Opus 5.5", date: null },
];

describe("resolveSelectedSlug", () => {
  it("uses the slug in the URL hash when it matches a game", () => {
    expect(resolveSelectedSlug("#opus_5-5", games)).toBe("opus_5-5");
  });

  it("falls back to the first game for an empty or unknown hash", () => {
    expect(resolveSelectedSlug("", games)).toBe("fable_5-1");
    expect(resolveSelectedSlug("#nope", games)).toBe("fable_5-1");
  });

  it("returns null when there are no games", () => {
    expect(resolveSelectedSlug("#opus_5-5", [])).toBeNull();
  });
});

describe("mountShell", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    window.location.hash = "";
  });

  const mount = (): HTMLElement => {
    const root = document.getElementById("root");
    if (root === null) {
      throw new Error("test root missing");
    }
    mountShell(root, games);
    return root;
  };

  const options = (root: HTMLElement): HTMLButtonElement[] => [...root.querySelectorAll<HTMLButtonElement>(".model-select-option")];

  it("shows the first game in the selector and loads it in the frame", () => {
    const root = mount();
    expect(root.querySelector(".model-select-trigger")?.textContent).toContain("Fable 5.1");
    expect(options(root).map((option) => option.textContent)).toEqual(["Fable 5.1", "Opus 5.5"]);
    expect(root.querySelector("iframe")?.getAttribute("src")).toBe("/play/fable_5-1/");
  });

  it("switches the frame and the URL hash when another game is chosen", () => {
    const root = mount();
    options(root)[1].click();
    expect(root.querySelector("iframe")?.getAttribute("src")).toBe("/play/opus_5-5/");
    expect(window.location.hash).toBe("#opus_5-5");
    expect(root.querySelector(".model-select-trigger")?.textContent).toContain("Opus 5.5");
  });

  it("links the title to the home page", () => {
    const root = mount();
    expect(root.querySelector("h1 a")?.getAttribute("href")).toBe("/");
  });

  it("shows an empty message when there are no games", () => {
    const root = document.getElementById("root") as HTMLElement; // Created in beforeEach, always present.
    mountShell(root, []);
    expect(root.textContent).toContain("No games");
  });

  it("returns a handle exposing the frame, games and current slug", () => {
    const root = document.getElementById("root") as HTMLElement; // Created in beforeEach, always present.
    const handle = mountShell(root, games);
    expect(handle?.frame).toBe(root.querySelector("iframe"));
    expect(handle?.games).toEqual(games);
    expect(handle?.getSelectedSlug()).toBe("fable_5-1");
    options(root)[1].click();
    expect(handle?.getSelectedSlug()).toBe("opus_5-5");
  });

  it("returns null when there are no games", () => {
    const root = document.getElementById("root") as HTMLElement; // Created in beforeEach, always present.
    expect(mountShell(root, [])).toBeNull();
  });

  it("notifies subscribers when the selection changes and stops after unsubscribe", () => {
    const root = document.getElementById("root") as HTMLElement; // Created in beforeEach, always present.
    const handle = mountShell(root, games);
    const listener = vi.fn();
    const unsubscribe = handle?.onSelectionChange(listener);

    options(root)[1].click();
    expect(listener).toHaveBeenCalledWith("opus_5-5");

    window.location.hash = "fable_5-1";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(listener).toHaveBeenLastCalledWith("fable_5-1");

    unsubscribe?.();
    listener.mockClear();
    options(root)[1].click();
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not notify when the selection is unchanged", () => {
    const root = document.getElementById("root") as HTMLElement; // Created in beforeEach, always present.
    const handle = mountShell(root, games);
    const listener = vi.fn();
    handle?.onSelectionChange(listener);
    options(root)[0].click();
    expect(listener).not.toHaveBeenCalled();
  });

  it("provides a slot for the saved games panel before the account slot", () => {
    const root = mount();
    const slots = [...root.querySelectorAll("header > div")].map((element) => element.className);
    expect(slots.indexOf("saved-games")).toBeGreaterThan(-1);
    expect(slots.indexOf("saved-games")).toBeLessThan(slots.indexOf("account"));
  });
});
