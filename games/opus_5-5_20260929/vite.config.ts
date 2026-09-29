import { defineConfig } from "vitest/config";

// `base` is intentionally unset: the platform passes --base=/play/<folder>/ at build time.
export default defineConfig({
  build: { outDir: "dist", target: "es2022" },
  worker: { format: "es" },
  test: { environment: "node", include: ["src/**/*.test.ts"], testTimeout: 60000 },
});
