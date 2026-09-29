import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { discoverGames } from "./discover-games.ts";
import { planGameBuild, type GamePackageJson } from "./plan-game-build.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const gamesDirectory = join(repositoryRoot, "games");
const outputDirectory = join(repositoryRoot, "dist");
const playDirectory = join(outputDirectory, "play");
const skipInstall = process.argv.includes("--skip-install");

const runNpm = (workingDirectory: string, args: string[], env: Record<string, string> = {}): void => {
  const result = spawnSync("npm", args, {
    cwd: workingDirectory,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(" ")} failed in ${workingDirectory}`);
  }
};

const folderNames = readdirSync(gamesDirectory).filter((name) =>
  statSync(join(gamesDirectory, name)).isDirectory(),
);
const games = discoverGames(folderNames);

rmSync(playDirectory, { recursive: true, force: true });
mkdirSync(playDirectory, { recursive: true });

for (const game of games) {
  const gameDirectory = join(gamesDirectory, game.slug);
  const packageJson = JSON.parse(readFileSync(join(gameDirectory, "package.json"), "utf8")) as GamePackageJson;
  const plan = planGameBuild(game.slug, packageJson);

  console.log(`\n=== ${game.label} ===`);
  if (!skipInstall) {
    runNpm(gameDirectory, ["ci"]);
  }
  // A stale export from an earlier run would be picked up by the game's own typecheck.
  rmSync(join(gameDirectory, plan.outputDirectory), { recursive: true, force: true });
  runNpm(gameDirectory, plan.buildArgs, plan.env);
  cpSync(join(gameDirectory, plan.outputDirectory), join(playDirectory, game.slug), { recursive: true });
}

writeFileSync(join(outputDirectory, "games.json"), `${JSON.stringify(games, null, 2)}\n`);
console.log(`\nBuilt ${games.length} games into ${playDirectory}`);
