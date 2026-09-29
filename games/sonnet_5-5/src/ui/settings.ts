import { LEVELS, type Level } from '../engine/engineTypes';
import { BLACK, type Color, WHITE } from '../engine/types';

export type SidePreference = 'white' | 'black' | 'random';

export interface Settings {
  side: SidePreference;
  level: Level;
}

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export const DEFAULT_SETTINGS: Settings = { side: 'white', level: 'medium' };

const STORAGE_KEY = 'chess.settings';
const SIDES: readonly SidePreference[] = ['white', 'black', 'random'];

export interface LevelOption {
  level: Level;
  label: string;
  description: string;
}

export const LEVEL_OPTIONS: readonly LevelOption[] = [
  { level: 'easy', label: 'Easy', description: 'Plays quickly and makes frequent mistakes. Good for learning.' },
  { level: 'medium', label: 'Medium', description: 'Sensible moves with the occasional oversight.' },
  { level: 'hard', label: 'Hard', description: 'Looks several moves ahead and punishes slips.' },
  { level: 'expert', label: 'Expert', description: 'Searches deepest and thinks longest. Brings your best game.' },
];

export const levelLabel = (level: Level): string => LEVEL_OPTIONS.find((o) => o.level === level)?.label ?? level;

export const loadSettings = (storage: StorageLike): Settings => {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_SETTINGS };
    const { side, level } = parsed as { side?: unknown; level?: unknown };
    return {
      side: SIDES.find((s) => s === side) ?? DEFAULT_SETTINGS.side,
      level: LEVELS.find((l) => l === level) ?? DEFAULT_SETTINGS.level,
    };
  } catch {
    // Unavailable or corrupt storage must never block starting a game.
    return { ...DEFAULT_SETTINGS };
  }
};

export const saveSettings = (storage: StorageLike, settings: Settings): void => {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Persistence is a convenience; ignore quota or privacy-mode failures.
  }
};

export const resolveSide = (side: SidePreference, random: () => number): Color => {
  if (side === 'white') return WHITE;
  if (side === 'black') return BLACK;
  return random() < 0.5 ? WHITE : BLACK;
};
