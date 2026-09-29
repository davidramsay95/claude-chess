import type { GameState } from "../state";

export const serializeState = (state: GameState): string => JSON.stringify(state, null, 2);

export const exportFileName = (date: Date): string => `chess-game-${date.toISOString().slice(0, 10)}.json`;

/** Downloads through a temporary link, which works without any server. */
export const downloadState = (state: GameState): void => {
  const blob = new Blob([serializeState(state)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = exportFileName(new Date());
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const legacyCopy = (text: string): boolean => {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.className = "offscreen";
  document.body.append(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
};

/**
 * Copies text, preferring the async clipboard API. Iframes often lack clipboard
 * permission, so fall back to a selection copy. Returns false if both fail.
 */
export const copyText = async (text: string): Promise<boolean> => {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText !== undefined) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or unsupported context; try the legacy path.
    }
  }
  return typeof document.execCommand === "function" ? legacyCopy(text) : false;
};
