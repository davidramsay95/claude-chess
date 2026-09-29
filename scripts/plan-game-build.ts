export interface GamePackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface GameBuildPlan {
  buildArgs: string[];
  env: Record<string, string>;
  outputDirectory: string;
}

/**
 * Decides how to build one game so it works under `/play/<slug>/`.
 * Vite takes the base path as a CLI flag; Next.js reads it from NEXT_BASE_PATH in its config.
 */
export const planGameBuild = (slug: string, packageJson: GamePackageJson): GameBuildPlan => {
  const allDependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

  if ("vite" in allDependencies) {
    return {
      buildArgs: ["run", "build", "--", `--base=/play/${slug}/`],
      env: {},
      outputDirectory: "dist",
    };
  }
  if ("next" in allDependencies) {
    return {
      buildArgs: ["run", "build"],
      env: { NEXT_BASE_PATH: `/play/${slug}` },
      outputDirectory: "out",
    };
  }
  throw new Error(`Cannot build ${slug}: neither vite nor next found in its package.json`);
};
