export type Difficulty = "easy" | "medium" | "hard" | "expert";

/** Every difficulty in ascending strength. */
export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard", "expert"];

/** Type guard for values coming from imports or the UI. */
export const isDifficulty = (value: unknown): value is Difficulty =>
  typeof value === "string" && (DIFFICULTIES as readonly string[]).includes(value);
