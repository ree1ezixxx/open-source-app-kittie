import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");
const defaultDbPath = path.join(repoRoot, "data", "kittie.db");

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? `file:${defaultDbPath}`,
  },
});
