import type { Session } from "../session";
import { parseStateText } from "../state";
import { button, el } from "./dom";

/**
 * Modal panel for importing a saved game from a file or pasted text. The text
 * is pre-checked with parseStateText, then handed to Session.load, the same
 * path the save bridge uses, so a failure leaves the current game untouched.
 */
export class ImportDialog {
  readonly root: HTMLElement;
  private readonly textarea: HTMLTextAreaElement;
  private readonly fileInput: HTMLInputElement;
  private readonly fileName: HTMLElement;
  private readonly errorLine: HTMLElement;
  private returnFocus: HTMLElement | null = null;

  constructor(
    private readonly session: Session,
    private readonly onImported: () => void,
  ) {
    this.textarea = el("textarea", {
      className: "import-text",
      attrs: { rows: "8", spellcheck: "false", placeholder: "Paste exported game JSON here", "aria-label": "Game JSON" },
    });
    this.fileInput = el("input", { className: "offscreen", attrs: { type: "file", accept: ".json,application/json", tabindex: "-1" } });
    this.fileName = el("span", { className: "import-file-name", text: "No file chosen" });
    this.errorLine = el("p", { className: "import-error", attrs: { role: "alert" } });
    this.errorLine.hidden = true;

    const choose = button("Choose .json file", "btn", () => this.fileInput.click());
    this.fileInput.addEventListener("change", () => void this.readFile());
    const submit = button("Import game", "btn btn-primary", () => this.submit());
    const cancel = button("Cancel", "btn btn-quiet", () => this.close());

    const card = el(
      "div",
      { className: "dialog-card", attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "import-title" } },
      el("h2", { className: "dialog-title", text: "Import game", attrs: { id: "import-title" } }),
      el("p", { className: "dialog-copy", text: "Load a game exported from here. Your current game is replaced only if the file is valid." }),
      el("div", { className: "import-file" }, choose, this.fileName, this.fileInput),
      this.textarea,
      this.errorLine,
      el("div", { className: "dialog-actions" }, cancel, submit),
    );
    this.root = el("div", { className: "dialog-backdrop" }, card);
    this.root.hidden = true;
    this.root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.close();
    });
    this.root.addEventListener("pointerdown", (event) => {
      if (event.target === this.root) this.close();
    });
    this.textarea.addEventListener("input", () => this.showError(null));
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.textarea.value = "";
    this.fileInput.value = "";
    this.fileName.textContent = "No file chosen";
    this.showError(null);
    this.root.hidden = false;
    this.textarea.focus();
  }

  close(): void {
    this.root.hidden = true;
    this.returnFocus?.focus();
    this.returnFocus = null;
  }

  /** Returns true when a game was loaded. Exposed for tests. */
  submit(): boolean {
    const text = this.textarea.value.trim();
    if (text === "") {
      this.showError("Choose a file or paste the game JSON first.");
      return false;
    }
    const parsed = parseStateText(text);
    if (!parsed.ok) {
      this.showError(parsed.error);
      return false;
    }
    const outcome = this.session.load(parsed.state);
    if (!outcome.ok) {
      this.showError(outcome.error);
      return false;
    }
    this.close();
    this.onImported();
    return true;
  }

  private async readFile(): Promise<void> {
    const file = this.fileInput.files?.[0];
    if (file === undefined) return;
    try {
      this.textarea.value = await file.text();
      this.fileName.textContent = file.name;
      this.showError(null);
    } catch (error) {
      this.showError(`Could not read that file: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  private showError(message: string | null): void {
    this.errorLine.hidden = message === null;
    this.errorLine.textContent = message ?? "";
  }
}
