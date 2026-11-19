import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

const alias = { "@shared": resolve("src/shared") };

export default defineConfig({
  main: {
    resolve: { alias },
    build: { rollupOptions: { input: resolve("src/main/index.ts") } },
  },
  preload: {
    resolve: { alias },
    build: { rollupOptions: { input: resolve("src/preload/index.ts") } },
  },
  renderer: {
    root: resolve("src/renderer"),
    resolve: { alias },
    plugins: [react()],
    build: { rollupOptions: { input: resolve("src/renderer/index.html") } },
  },
});
