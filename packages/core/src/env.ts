import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().default("file:./data/kittie.db"),
  // Default matches the web dev proxy (apps/web/vite.config.ts -> :3008) so a
  // fresh `pnpm dev:api` + `pnpm dev:web` works with no env fiddling.
  PORT: z.coerce.number().default(3008),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  META_ACCESS_TOKEN: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  /** Hosted Turso DB — set in CI/cloud; absent locally (file: DB is used). */
  TURSO_DATABASE_URL: z.string().optional(),
  TURSO_AUTH_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Values from the repo-root `.env` file. Nothing in the repo loads dotenv and
 * scripts start from package dirs, so we find `.env` by walking up from cwd.
 * Real environment variables always win over file values.
 */
function loadDotenvFile(): Record<string, string> {
  let dir = process.cwd();
  for (let depth = 0; depth < 5; depth++) {
    const file = path.join(dir, ".env");
    if (existsSync(file)) {
      const out: Record<string, string> = {};
      for (const line of readFileSync(file, "utf8").split("\n")) {
        const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
        const [, key, value] = m ?? [];
        if (!key || value === undefined || line.trimStart().startsWith("#")) continue;
        out[key] = value.replace(/^["']|["']$/g, "");
      }
      return out;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return {};
}

export function loadEnv(overrides?: Partial<Env>): Env {
  const fromFile = loadDotenvFile();
  // Backfill process.env so modules that read it directly (e.g. the DB client
  // picking TURSO_DATABASE_URL/TURSO_AUTH_TOKEN) see .env values too.
  for (const [key, value] of Object.entries(fromFile)) {
    process.env[key] ??= value;
  }
  return envSchema.parse({ ...fromFile, ...process.env, ...overrides });
}
