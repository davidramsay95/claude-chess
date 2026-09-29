import "./style.css";
import { mountShell, type GameSummary } from "./shell.ts";

const loadGames = async (): Promise<GameSummary[]> => {
  const response = await fetch("/games.json");
  if (!response.ok) {
    throw new Error(`Could not load games.json: ${response.status}`);
  }
  return (await response.json()) as GameSummary[]; // Shape is written by scripts/build-games.ts.
};

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Missing #root element");
}
mountShell(root, await loadGames());
