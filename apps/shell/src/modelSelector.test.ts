import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameSummary } from "./gameSummary.ts";
import { mountModelSelector, type ModelSelectorHandle } from "./modelSelector.ts";

const games: GameSummary[] = [
  { slug: "fable_5-1_20260929", label: "Fable 5.1 (2026-09-29)", date: "2026-09-29" },
  { slug: "opus_5-5_20260929", label: "Opus 5.5 (2026-09-29)", date: "2026-09-29" },
];

const firePointer = (target: Element, type: "pointerenter" | "pointerleave", pointerType: string): void => {
  const event = new Event(type);
  Object.defineProperty(event, "pointerType", { value: pointerType });
  target.dispatchEvent(event);
};

describe("mountModelSelector", () => {
  let onSelect: ReturnType<typeof vi.fn<(slug: string) => void>>;
  let selector: ModelSelectorHandle;

  const trigger = (): HTMLButtonElement => selector.element.querySelector(".model-select-trigger") as HTMLButtonElement; // Always rendered.
  const list = (): HTMLElement => selector.element.querySelector(".model-select-list") as HTMLElement; // Always rendered.
  const options = (): HTMLButtonElement[] => [...selector.element.querySelectorAll<HTMLButtonElement>(".model-select-option")];
  const isOpen = (): boolean => trigger().getAttribute("aria-expanded") === "true" && !list().hidden;

  beforeEach(() => {
    document.body.innerHTML = "";
    onSelect = vi.fn<(slug: string) => void>();
    selector = mountModelSelector({ games, selectedSlug: "fable_5-1_20260929", onSelect });
    document.body.append(selector.element);
  });

  it("shows only the selected model and version, without the date, until opened", () => {
    expect(trigger().textContent).toContain("Fable 5.1");
    expect(trigger().textContent).not.toContain("2026");
    expect(isOpen()).toBe(false);
  });

  it("lists every game with its date when opened", () => {
    trigger().click();
    expect(options().map((option) => option.textContent)).toEqual(["Fable 5.12026-09-29", "Opus 5.52026-09-29"]);
  });

  it("marks the selected game as current in the list", () => {
    expect(options().map((option) => option.getAttribute("aria-current"))).toEqual(["true", null]);
  });

  it("opens on mouse hover and closes when the mouse leaves", () => {
    firePointer(selector.element, "pointerenter", "mouse");
    expect(isOpen()).toBe(true);
    firePointer(selector.element, "pointerleave", "mouse");
    expect(isOpen()).toBe(false);
  });

  it("ignores touch hover so a tap does not open and then instantly close", () => {
    firePointer(selector.element, "pointerenter", "touch");
    expect(isOpen()).toBe(false);
    trigger().click();
    expect(isOpen()).toBe(true);
  });

  it("stays open after the mouse leaves once the trigger was clicked", () => {
    firePointer(selector.element, "pointerenter", "mouse");
    trigger().click();
    firePointer(selector.element, "pointerleave", "mouse");
    expect(isOpen()).toBe(true);
  });

  it("closes on a second click even while hovered", () => {
    firePointer(selector.element, "pointerenter", "mouse");
    trigger().click();
    trigger().click();
    expect(isOpen()).toBe(false);
  });

  it("selects a game, updates the trigger and closes", () => {
    trigger().click();
    options()[1].click();
    expect(onSelect).toHaveBeenCalledWith("opus_5-5_20260929");
    expect(trigger().textContent).toContain("Opus 5.5");
    expect(options().map((option) => option.getAttribute("aria-current"))).toEqual([null, "true"]);
    expect(isOpen()).toBe(false);
  });

  it("does not call onSelect when the current game is chosen again", () => {
    trigger().click();
    options()[0].click();
    expect(onSelect).not.toHaveBeenCalled();
    expect(isOpen()).toBe(false);
  });

  it("closes on Escape and returns focus to the trigger", () => {
    trigger().click();
    options()[0].focus();
    options()[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger());
  });

  it("closes when the user clicks elsewhere on the page", () => {
    trigger().click();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(isOpen()).toBe(false);
  });

  it("follows selection changes made elsewhere", () => {
    selector.setSelected("opus_5-5_20260929");
    expect(trigger().textContent).toContain("Opus 5.5");
    expect(onSelect).not.toHaveBeenCalled();
  });
});
