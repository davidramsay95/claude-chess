/** One game as written to games.json by scripts/build-games.ts. */
export interface GameSummary {
  slug: string;
  /** Model, version and, when the run is dated, the date in brackets. */
  label: string;
  date?: string | null;
}

/** The model and version without the run date, for places where the date is noise. */
export const gameName = (game: GameSummary): string =>
  game.date ? game.label.replace(` (${game.date})`, "") : game.label;
