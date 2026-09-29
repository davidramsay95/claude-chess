import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountShell, resolveSelectedSlug, type GameSummary } from "./shell.ts";

const games: GameSummary[] = [
  { slug: "fable_5-1", label: "Fable 5.1" },
  { slug: "opus_5-5", label: "Opus 5.5" },
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

  it("renders one tab per game and loads the first game in the frame", () => {
    const root = mount();
    const tabs = root.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    expect([...tabs].map((tab) => tab.textContent)).toEqual(["Fable 5.1", "Opus 5.5"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(root.querySelector("iframe")?.getAttribute("src")).toBe("/play/fable_5-1/");
  });

  it("switches the frame and the URL hash when another tab is clicked", () => {
    const root = mount();
    root.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
    expect(root.querySelector("iframe")?.getAttribute("src")).toBe("/play/opus_5-5/");
    expect(window.location.hash).toBe("#opus_5-5");
    expect(root.querySelectorAll('[role="tab"]')[1].getAttribute("aria-selected")).toBe("true");
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
    root.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
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

    root.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
    expect(listener).toHaveBeenCalledWith("opus_5-5");

    window.location.hash = "fable_5-1";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(listener).toHaveBeenLastCalledWith("fable_5-1");

    unsubscribe?.();
    listener.mockClear();
    root.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not notify when the selection is unchanged", () => {
    const root = document.getElementById("root") as HTMLElement; // Created in beforeEach, always present.
    const handle = mountShell(root, games);
    const listener = vi.fn();
    handle?.onSelectionChange(listener);
    root.querySelectorAll<HTMLButtonElement>('[role="tab"]')[0].click();
    expect(listener).not.toHaveBeenCalled();
  });

  it("provides a slot for the saved games panel before the account slot", () => {
    const root = mount();
    const slots = [...root.querySelectorAll("header > div")].map((element) => element.className);
    expect(slots.indexOf("saved-games")).toBeGreaterThan(-1);
    expect(slots.indexOf("saved-games")).toBeLessThan(slots.indexOf("account"));
  });
});
