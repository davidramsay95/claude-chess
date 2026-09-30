import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// No `base` is set here on purpose: the hosting platform passes
// `--base=/play/<folder>/` on the CLI at build time (see README).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
  },
});
