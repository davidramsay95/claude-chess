/**
 * Tiny localStorage wrapper for remembering the player's last-used setup
 * choices. All keys are prefixed per the platform's convention so multiple
 * games sharing an origin never collide. Every access is wrapped in
 * try/catch since localStorage can throw (private browsing, disabled
 * storage, etc.) and this is purely a convenience, never load-bearing.
 */

import type { Color } from "../engine/index";
import type { Difficulty } from "../ai/index";

const PREFIX = "sonnet_5-0_20260930_";
const COLOR_KEY = `${PREFIX}lastColor`;
const DIFFICULTY_KEY = `${PREFIX}lastDifficulty`;

const VALID_COLORS: readonly string[] = ["white", "black"];
const VALID_DIFFICULTIES: readonly string[] = ["easy", "medium", "hard", "expert"];

export interface StoredPreferences {
  color: Color;
  difficulty: Difficulty;
}

const DEFAULTS: StoredPreferences = { color: "white", difficulty: "medium" };

export function loadPreferences(): StoredPreferences {
  try {
    const color = window.localStorage.getItem(COLOR_KEY);
    const difficulty = window.localStorage.getItem(DIFFICULTY_KEY);
    return {
      color: color && VALID_COLORS.includes(color) ? (color as Color) : DEFAULTS.color,
      difficulty:
        difficulty && VALID_DIFFICULTIES.includes(difficulty) ? (difficulty as Difficulty) : DEFAULTS.difficulty,
    };
  } catch {
    return DEFAULTS;
  }
}

export function savePreferences(preferences: StoredPreferences): void {
  try {
    window.localStorage.setItem(COLOR_KEY, preferences.color);
    window.localStorage.setItem(DIFFICULTY_KEY, preferences.difficulty);
  } catch {
    // Best-effort only.
  }
}
