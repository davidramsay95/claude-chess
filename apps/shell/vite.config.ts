import { defineConfig } from "vitest/config";

// Builds into the repository-level dist folder next to play/ and games.json, so it must not empty it.
export default defineConfig({
  build: { outDir: "../../dist", emptyOutDir: false },
  test: { environment: "jsdom", include: ["src/**/*.test.ts"] },
});
