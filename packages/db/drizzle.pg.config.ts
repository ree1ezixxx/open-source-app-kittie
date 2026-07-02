import { defineConfig } from "drizzle-kit";

// Postgres (Supabase/Neon) generation config for the dual-dialect port (#242).
// Generates DDL for the pg mirror schema into ./drizzle/pg. The runtime driver
// selection lives in src/client.ts; this only drives `drizzle-kit generate:pg`.
export default defineConfig({
  schema: "./src/schema.pg.ts",
  out: "./drizzle/pg",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://localhost:5432/kittie" },
});
