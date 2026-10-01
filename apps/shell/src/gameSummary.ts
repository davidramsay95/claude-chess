/** One game as written to games.json by scripts/build-games.ts. */
export interface GameSummary {
  slug: string;
  /** Model, version and, when the release date is known, that date in brackets. */
  label: string;
  /** The model's release date (YYYY-MM-DD). */
  date?: string | null;
}

/** The model and version without the release date, for places where the date is noise. */
export const gameName = (game: GameSummary): string =>
  game.date ? game.label.replace(` (${game.date})`, "") : game.label;
