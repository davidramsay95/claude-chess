import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Builds into the repository-level dist folder next to play/ and games.json, so it must not empty it.
// The legal pages are separate entries so they are emitted as /terms-of-service.html and
// /privacy-policy.html, which Workers static assets serve at the extensionless URLs without a redirect.
export default defineConfig({
  build: {
    outDir: "../../dist",
    emptyOutDir: false,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        "terms-of-service": resolve(import.meta.dirname, "terms-of-service.html"),
        "privacy-policy": resolve(import.meta.dirname, "privacy-policy.html"),
      },
    },
  },
  test: { environment: "jsdom", include: ["src/**/*.test.ts"] },
});
