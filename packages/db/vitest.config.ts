import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only run source tests, never the compiled copies under dist/.
    include: ["src/**/*.test.ts"],
  },
});
