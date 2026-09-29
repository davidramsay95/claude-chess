import { defineConfig } from "vitest/config";

export default defineConfig({
  build: { outDir: "dist", target: "es2022" },
  worker: { format: "es" },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
