import { describe, expect, it } from 'vitest';
import { BLACK, WHITE } from '../../src/engine/types';
import { DEFAULT_SETTINGS, loadSettings, resolveSide, saveSettings, type StorageLike } from '../../src/ui/settings';

const memoryStorage = (initial: Record<string, string> = {}): StorageLike => {
  const data = { ...initial };
  return {
    getItem: (key: string): string | null => data[key] ?? null,
    setItem: (key: string, value: string): void => {
      data[key] = value;
    },
  };
};

describe('settings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips saved settings', () => {
    const storage = memoryStorage();
    saveSettings(storage, { side: 'black', level: 'expert' });
    expect(loadSettings(storage)).toEqual({ side: 'black', level: 'expert' });
  });

  it('falls back to defaults for corrupt or invalid data', () => {
    expect(loadSettings(memoryStorage({ 'chess.settings': '{nope' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memoryStorage({ 'chess.settings': '{"side":"purple","level":"easy"}' }))).toEqual({
      side: DEFAULT_SETTINGS.side,
      level: 'easy',
    });
  });

  it('survives a storage that throws', () => {
    const broken: StorageLike = {
      getItem: (): string | null => {
        throw new Error('denied');
      },
      setItem: (): void => {
        throw new Error('denied');
      },
    };
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(broken, DEFAULT_SETTINGS)).not.toThrow();
  });

  it('resolves random side using the supplied random source', () => {
    expect(resolveSide('white', () => 0.9)).toBe(WHITE);
    expect(resolveSide('black', () => 0.1)).toBe(BLACK);
    expect(resolveSide('random', () => 0.2)).toBe(WHITE);
    expect(resolveSide('random', () => 0.7)).toBe(BLACK);
  });
});
