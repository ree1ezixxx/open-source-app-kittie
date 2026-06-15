import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");
const defaultDbPath = path.join(repoRoot, "data", "kittie.db");

// Targets Turso when TURSO_DATABASE_URL is set, else the local file —
// the same precedence the runtime client uses.
const tursoUrl = process.env.TURSO_DATABASE_URL;

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  ...(tursoUrl
    ? {
        dialect: "turso" as const,
        dbCredentials: { url: tursoUrl, authToken: process.env.TURSO_AUTH_TOKEN },
      }
    : {
        dialect: "sqlite" as const,
        dbCredentials: { url: process.env.DATABASE_URL ?? `file:${defaultDbPath}` },
      }),
});
