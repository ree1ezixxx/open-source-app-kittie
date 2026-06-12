import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "dist/"],
    },
  },
  resolve: {
    alias: {
      "@kittie/types": path.resolve(__dirname, "../types/src"),
      "@kittie/db": path.resolve(__dirname, "../db/src"),
    },
  },
});
