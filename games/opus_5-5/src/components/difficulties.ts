import type { Difficulty } from "@/engine/protocol";

interface DifficultyInfo {
  name: string;
  description: string;
}

export const DIFFICULTY_INFO: Record<Difficulty, DifficultyInfo> = {
  easy: { name: "Easy", description: "Makes casual mistakes. Good for learning." },
  medium: { name: "Medium", description: "Plays sound moves but misses deeper tactics." },
  hard: { name: "Hard", description: "Calculates ahead and punishes loose play." },
  expert: { name: "Expert", description: "Searches deeply and takes its time. Expect a fight." },
};
