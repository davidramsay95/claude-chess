import { defineConfig } from "vite";

// `base` is intentionally absent: the platform supplies it via
// `npm run build -- --base=/play/<folder>/`.
export default defineConfig({
  build: {
    outDir: "dist",
    target: "es2022",
  },
  worker: {
    format: "es",
  },
});
