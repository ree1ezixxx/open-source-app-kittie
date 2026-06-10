import { serve } from "@hono/node-server";
import { loadEnv } from "@kittie/core";
import { createApp } from "./app.js";
import { startFreshness } from "./services/freshness-service.js";
import { registerAllSweeps } from "./sweeps.js";

const env = loadEnv();
const app = createApp();

registerAllSweeps();

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Kittie API listening on http://localhost:${info.port}`);
  startFreshness();
});

export { createApp };
