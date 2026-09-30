/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// The platform builds with `--base=/play/<folder>/`, so `base` is intentionally
// left unset here. The output directory must be `dist` (Vite's default).
export default defineConfig({
  build: {
    outDir: "dist",
    target: "es2022",
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
