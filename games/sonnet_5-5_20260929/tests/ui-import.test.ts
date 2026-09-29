// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { START_FEN } from "../src/engine/position";
import { Session } from "../src/session";
import { ImportDialog } from "../src/ui/importDialog";

const validText = JSON.stringify({
  version: 1,
  startFen: START_FEN,
  playerColor: "black",
  difficulty: "hard",
  moves: ["e2e4", "e7e5"],
  resigned: false,
});

const openDialog = (session: Session, onImported = vi.fn()): { dialog: ImportDialog; text: HTMLTextAreaElement; error: HTMLElement } => {
  const dialog = new ImportDialog(session, onImported);
  document.body.append(dialog.root);
  dialog.open();
  const text = dialog.root.querySelector("textarea") as HTMLTextAreaElement;
  const error = dialog.root.querySelector(".import-error") as HTMLElement;
  return { dialog, text, error };
};

describe("ImportDialog", () => {
  it("shows an inline error for bad JSON and leaves the game alone", () => {
    const session = new Session();
    session.start("white", "easy");
    session.playMove("d2d4");
    const { dialog, text, error } = openDialog(session);
    text.value = "not json";
    expect(dialog.submit()).toBe(false);
    expect(error.hidden).toBe(false);
    expect(error.textContent).toContain("not valid JSON");
    expect(dialog.isOpen).toBe(true);
    expect(session.game?.moves).toEqual(["d2d4"]);
  });

  it("reports an illegal move and changes nothing", () => {
    const session = new Session();
    session.start("white", "easy");
    const { dialog, text, error } = openDialog(session);
    text.value = JSON.stringify({ ...JSON.parse(validText), moves: ["e2e5"] });
    expect(dialog.submit()).toBe(false);
    expect(error.textContent).toContain("not legal");
    expect(session.game?.moves).toEqual([]);
    expect(session.playerColor).toBe("white");
  });

  it("asks for input when empty", () => {
    const { dialog, error } = openDialog(new Session());
    expect(dialog.submit()).toBe(false);
    expect(error.textContent).toContain("paste");
  });

  it("loads a valid game, closes and notifies", () => {
    const session = new Session();
    const onImported = vi.fn();
    const { dialog, text } = openDialog(session, onImported);
    text.value = validText;
    expect(dialog.submit()).toBe(true);
    expect(dialog.isOpen).toBe(false);
    expect(onImported).toHaveBeenCalledOnce();
    expect(session.playerColor).toBe("black");
    expect(session.game?.moves).toEqual(["e2e4", "e7e5"]);
  });
});
