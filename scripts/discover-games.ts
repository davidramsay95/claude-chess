export interface GameEntry {
  slug: string;
  model: string;
  version: string;
  subversion: string;
  label: string;
  /** ISO date (YYYY-MM-DD) from an optional `_YYYYMMDD` folder suffix, so several runs of one model version can coexist. */
  date: string | null;
}

const GAME_FOLDER_PATTERN = /^([a-z]+)_(\d+)-(\d+)(?:_(\d{4})(\d{2})(\d{2}))?$/;

const isRealCalendarDate = (year: number, month: number, day: number): boolean => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

/**
 * Parses a `model_version-subversion` or `model_version-subversion_YYYYMMDD` folder name into a manifest entry.
 * Returns null when the name does not follow that format or the date is not a real calendar date.
 */
export const parseGameFolderName = (folderName: string): GameEntry | null => {
  const match = GAME_FOLDER_PATTERN.exec(folderName);
  if (match === null) {
    return null;
  }
  const [, model, version, subversion, year, month, day] = match;

  let date: string | null = null;
  if (year !== undefined) {
    if (!isRealCalendarDate(Number(year), Number(month), Number(day))) {
      return null;
    }
    date = `${year}-${month}-${day}`;
  }

  const capitalisedModel = `${model.charAt(0).toUpperCase()}${model.slice(1)}`;
  const baseLabel = `${capitalisedModel} ${version}.${subversion}`;
  return {
    slug: folderName,
    model,
    version,
    subversion,
    label: date === null ? baseLabel : `${baseLabel} (${date})`,
    date,
  };
};

const compareVersionsDescending = (a: GameEntry, b: GameEntry): number =>
  Number(b.version) - Number(a.version) || Number(b.subversion) - Number(a.subversion);

// Undated runs sort after dated ones of the same version.
const compareDatesDescending = (a: GameEntry, b: GameEntry): number => (b.date ?? "").localeCompare(a.date ?? "");

/** Filters folder names down to valid games, sorted by model, then newest version, then newest date. */
export const discoverGames = (folderNames: readonly string[]): GameEntry[] =>
  folderNames
    .map(parseGameFolderName)
    .filter((entry): entry is GameEntry => entry !== null)
    .sort((a, b) => a.model.localeCompare(b.model) || compareVersionsDescending(a, b) || compareDatesDescending(a, b));
