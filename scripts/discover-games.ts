export interface GameEntry {
  slug: string;
  model: string;
  version: string;
  subversion: string;
  label: string;
  /** ISO date (YYYY-MM-DD) the model was released, from RELEASE_DATES. Null when it is not listed there. */
  date: string | null;
  /** ISO date (YYYY-MM-DD) from an optional `_YYYYMMDD` folder suffix, so several runs of one model version can coexist. */
  builtOn: string | null;
}

/**
 * Release dates by `model_version-subversion`. Add a line here when a new model is added; a game whose model is
 * missing is still listed, just without a date and after every dated one.
 */
export const RELEASE_DATES: Readonly<Record<string, string>> = {
  "haiku_4-5": "2025-10-15",
  "opus_4-6": "2026-02-05",
  "sonnet_4-6": "2026-02-17",
  "opus_4-7": "2026-04-16",
  "opus_4-8": "2026-05-28",
  "fable_5-0": "2026-06-09",
  "sonnet_5-0": "2026-06-30",
  "opus_5-0": "2026-07-24",
  "fable_5-1": "2026-09-01",
  "opus_5-5": "2026-09-22",
  "sonnet_5-5": "2026-09-28",
};

const GAME_FOLDER_PATTERN = /^([a-z]+)_(\d+)-(\d+)(?:_(\d{4})(\d{2})(\d{2}))?$/;

const isRealCalendarDate = (year: number, month: number, day: number): boolean => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

/**
 * Parses a `model_version-subversion` or `model_version-subversion_YYYYMMDD` folder name into a manifest entry.
 * Returns null when the name does not follow that format or the folder date is not a real calendar date.
 */
export const parseGameFolderName = (
  folderName: string,
  releaseDates: Readonly<Record<string, string>> = RELEASE_DATES,
): GameEntry | null => {
  const match = GAME_FOLDER_PATTERN.exec(folderName);
  if (match === null) {
    return null;
  }
  const [, model, version, subversion, year, month, day] = match;

  let builtOn: string | null = null;
  if (year !== undefined) {
    if (!isRealCalendarDate(Number(year), Number(month), Number(day))) {
      return null;
    }
    builtOn = `${year}-${month}-${day}`;
  }

  const capitalisedModel = `${model.charAt(0).toUpperCase()}${model.slice(1)}`;
  const baseLabel = `${capitalisedModel} ${version}.${subversion}`;
  const date = releaseDates[`${model}_${version}-${subversion}`] ?? null;
  return {
    slug: folderName,
    model,
    version,
    subversion,
    label: date === null ? baseLabel : `${baseLabel} (${date})`,
    date,
    builtOn,
  };
};

// Undated entries sort after dated ones.
const compareDatesDescending = (a: string | null, b: string | null): number => (b ?? "").localeCompare(a ?? "");

const compareVersionsDescending = (a: GameEntry, b: GameEntry): number =>
  Number(b.version) - Number(a.version) || Number(b.subversion) - Number(a.subversion);

/** Filters folder names down to valid games, sorted by release date (newest first), then model, version and run date. */
export const discoverGames = (
  folderNames: readonly string[],
  releaseDates: Readonly<Record<string, string>> = RELEASE_DATES,
): GameEntry[] =>
  folderNames
    .map((folderName) => parseGameFolderName(folderName, releaseDates))
    .filter((entry): entry is GameEntry => entry !== null)
    .sort(
      (a, b) =>
        compareDatesDescending(a.date, b.date) ||
        a.model.localeCompare(b.model) ||
        compareVersionsDescending(a, b) ||
        compareDatesDescending(a.builtOn, b.builtOn),
    );
