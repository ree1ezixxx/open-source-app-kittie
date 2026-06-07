import { serve } from "@hono/node-server";
import { loadEnv } from "@kittie/core";
import { createApp } from "./app.js";

const env = loadEnv();
const app = createApp();

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Kittie API listening on http://localhost:${info.port}`);
});

export { createApp };
