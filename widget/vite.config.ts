import { fileURLToPath } from "node:url";
import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

// Builds the embeddable widget into public/widget.js (served by Next.js).
export default defineConfig({
  root,
  plugins: [preact()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: fileURLToPath(new URL("../public", import.meta.url)),
    emptyOutDir: false,
    sourcemap: true,
    lib: {
      entry: fileURLToPath(new URL("./src/main.tsx", import.meta.url)),
      name: "RadiusRoadmapWidget",
      formats: ["iife"],
      fileName: () => "widget.js",
    },
  },
});
