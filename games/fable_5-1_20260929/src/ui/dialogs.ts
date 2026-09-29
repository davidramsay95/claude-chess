import { BISHOP, KNIGHT, QUEEN, ROOK, pieceOf } from "../engine/types";
import { pieceLabel, pieceSvg } from "./pieces";

export interface PromotionPicker {
  /** Show the four choices for `color` and resolve with the chosen piece type, or null when dismissed. */
  choose(color: number): Promise<number | null>;
  hide(): void;
}

/** An overlay on the board offering queen, rook, bishop and knight. */
export const createPromotionPicker = (overlay: HTMLElement): PromotionPicker => {
  overlay.classList.add("promotion");
  overlay.hidden = true;
  let resolveCurrent: ((choice: number | null) => void) | null = null;

  const finish = (choice: number | null): void => {
    overlay.hidden = true;
    overlay.replaceChildren();
    const resolve = resolveCurrent;
    resolveCurrent = null;
    resolve?.(choice);
  };

  const choose = (color: number): Promise<number | null> => {
    finish(null);
    overlay.replaceChildren();
    const title = document.createElement("p");
    title.className = "promotion-title";
    title.textContent = "Promote to";
    overlay.append(title);
    const row = document.createElement("div");
    row.className = "promotion-choices";
    for (const type of [QUEEN, ROOK, BISHOP, KNIGHT]) {
      const piece = pieceOf(type, color);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "promotion-choice";
      button.setAttribute("aria-label", pieceLabel(piece));
      button.innerHTML = pieceSvg(piece);
      button.addEventListener("click", (): void => finish(type));
      row.append(button);
    }
    overlay.append(row);
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "promotion-cancel";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", (): void => finish(null));
    overlay.append(cancel);
    overlay.hidden = false;
    return new Promise<number | null>((resolve): void => {
      resolveCurrent = resolve;
    });
  };

  return { choose, hide: (): void => finish(null) };
};

export interface ExportDialog {
  open(json: string, fileName: string): void;
}

/** Download as a file or copy the JSON to the clipboard. */
export const createExportDialog = (dialog: HTMLDialogElement): ExportDialog => {
  const textarea = dialog.querySelector<HTMLTextAreaElement>("textarea");
  const downloadButton = dialog.querySelector<HTMLButtonElement>("[data-action=download]");
  const copyButton = dialog.querySelector<HTMLButtonElement>("[data-action=copy]");
  const closeButton = dialog.querySelector<HTMLButtonElement>("[data-action=close]");
  const message = dialog.querySelector<HTMLElement>("[data-role=message]");
  let currentJson = "";
  let currentFileName = "game.json";

  const say = (text: string): void => {
    if (message) message.textContent = text;
  };

  downloadButton?.addEventListener("click", (): void => {
    const blob = new Blob([currentJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = currentFileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout((): void => URL.revokeObjectURL(url), 1000);
    say(`Saved as ${currentFileName}.`);
  });

  copyButton?.addEventListener("click", (): void => {
    const clipboard = navigator.clipboard;
    if (!clipboard || typeof clipboard.writeText !== "function") {
      say("Clipboard is not available here; select the text and copy it by hand.");
      textarea?.select();
      return;
    }
    clipboard.writeText(currentJson).then(
      (): void => say("Copied to the clipboard."),
      (): void => {
        say("Copy failed; select the text and copy it by hand.");
        textarea?.select();
      },
    );
  });

  closeButton?.addEventListener("click", (): void => dialog.close());

  return {
    open: (json: string, fileName: string): void => {
      currentJson = json;
      currentFileName = fileName;
      if (textarea) textarea.value = json;
      say("");
      dialog.showModal();
    },
  };
};

export interface ImportDialog {
  open(): void;
}

/** Accepts a file or pasted JSON and hands the raw text to `onImport`, which returns an error message or null. */
export const createImportDialog = (dialog: HTMLDialogElement, onImport: (text: string) => string | null): ImportDialog => {
  const fileInput = dialog.querySelector<HTMLInputElement>("input[type=file]");
  const textarea = dialog.querySelector<HTMLTextAreaElement>("textarea");
  const loadButton = dialog.querySelector<HTMLButtonElement>("[data-action=load]");
  const closeButton = dialog.querySelector<HTMLButtonElement>("[data-action=close]");
  const message = dialog.querySelector<HTMLElement>("[data-role=message]");

  const say = (text: string, isError: boolean): void => {
    if (!message) return;
    message.textContent = text;
    message.classList.toggle("error", isError);
  };

  const attempt = (text: string): void => {
    if (text.trim() === "") {
      say("Choose a file or paste the saved game first.", true);
      return;
    }
    const error = onImport(text);
    if (error === null) {
      dialog.close();
      return;
    }
    say(error, true);
  };

  fileInput?.addEventListener("change", (): void => {
    const file = fileInput.files?.[0];
    if (!file) return;
    file.text().then(
      (text): void => {
        if (textarea) textarea.value = text;
        attempt(text);
      },
      (): void => say("Could not read that file.", true),
    );
  });

  loadButton?.addEventListener("click", (): void => attempt(textarea?.value ?? ""));
  closeButton?.addEventListener("click", (): void => dialog.close());

  return {
    open: (): void => {
      if (fileInput) fileInput.value = "";
      if (textarea) textarea.value = "";
      say("", false);
      dialog.showModal();
    },
  };
};
