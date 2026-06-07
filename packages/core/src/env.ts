import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().default("file:./data/kittie.db"),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  META_ACCESS_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(overrides?: Partial<Env>): Env {
  return envSchema.parse({ ...process.env, ...overrides });
}
