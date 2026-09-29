import "./style.css";
import { mountAccountMenu } from "./account.ts";
import { mountSavedGames } from "./savedGames.ts";
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
const shell = mountShell(root, await loadGames());

const savedGamesSlot = root.querySelector<HTMLElement>(".saved-games");
const savedGames = shell !== null && savedGamesSlot !== null ? mountSavedGames(savedGamesSlot, { shell }) : null;

const accountSlot = root.querySelector<HTMLElement>(".account");
if (accountSlot !== null) {
  mountAccountMenu(accountSlot, { onSessionChange: (user) => savedGames?.setUser(user) });
}
