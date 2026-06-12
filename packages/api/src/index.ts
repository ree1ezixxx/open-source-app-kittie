import { serve } from "@hono/node-server";
import { loadEnv } from "@kittie/core";
import { createApp } from "./app.js";
import { startFreshness } from "./services/freshness-service.js";
import { registerAllSweeps } from "./sweeps.js";
import { seedAppEngine } from "./scripts/seed-app-engine.js";

const env = loadEnv();
const app = createApp();

registerAllSweeps();

// Seed cloneable apps on startup if not already seeded
seedAppEngine().catch((e) => {
  console.warn("Failed to seed app engine:", e instanceof Error ? e.message : e);
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Kittie API listening on http://localhost:${info.port}`);
  startFreshness();
});

export { createApp };
