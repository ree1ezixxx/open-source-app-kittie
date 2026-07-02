import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only the TypeScript sources — dist/ holds stale compiled copies of the
    // same tests, which would otherwise run twice against the old build.
    include: ["src/**/*.test.ts"],
  },
});
