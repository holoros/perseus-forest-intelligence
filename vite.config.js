import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" makes the build relative-path friendly for any static host
// (GitHub Pages project pages, S3 subfolders, UMaine web space, etc.)
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", chunkSizeWarningLimit: 1500 },
});
