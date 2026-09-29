import { beforeEach, describe, expect, it } from "vitest";
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
});
