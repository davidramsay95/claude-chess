import { defineConfig } from "vitest/config";

// The platform supplies --base on the command line, so no base is set here.
export default defineConfig({
  build: {
    outDir: "dist",
    target: "es2022",
  },
  worker: {
    format: "es",
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
