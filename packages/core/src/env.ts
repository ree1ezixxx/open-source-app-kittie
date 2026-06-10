import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().default("file:./data/kittie.db"),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  META_ACCESS_TOKEN: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
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
  return envSchema.parse({ ...loadDotenvFile(), ...process.env, ...overrides });
}
