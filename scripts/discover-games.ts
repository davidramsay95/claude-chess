export interface GameEntry {
  slug: string;
  model: string;
  version: string;
  subversion: string;
  label: string;
}

const GAME_FOLDER_PATTERN = /^([a-z]+)_(\d+)-(\d+)$/;

/**
 * Parses a `model_version-subversion` folder name into a manifest entry.
 * Returns null when the name does not follow that format.
 */
export const parseGameFolderName = (folderName: string): GameEntry | null => {
  const match = GAME_FOLDER_PATTERN.exec(folderName);
  if (match === null) {
    return null;
  }
  const [, model, version, subversion] = match;
  const capitalisedModel = `${model.charAt(0).toUpperCase()}${model.slice(1)}`;
  return {
    slug: folderName,
    model,
    version,
    subversion,
    label: `${capitalisedModel} ${version}.${subversion}`,
  };
};

const compareVersionsDescending = (a: GameEntry, b: GameEntry): number =>
  Number(b.version) - Number(a.version) || Number(b.subversion) - Number(a.subversion);

/** Filters folder names down to valid games, sorted by model then newest version first. */
export const discoverGames = (folderNames: readonly string[]): GameEntry[] =>
  folderNames
    .map(parseGameFolderName)
    .filter((entry): entry is GameEntry => entry !== null)
    .sort((a, b) => a.model.localeCompare(b.model) || compareVersionsDescending(a, b));
