import { Hono } from "hono";
import { cors } from "hono/cors";
import { SUPPORTED_COUNTRIES } from "./mock/fixtures.js";
import { adsRouter } from "./routes/ads.js";
import { aiRouter } from "./routes/ai.js";
import { auditRouter } from "./routes/audit.js";
import { appEngineRouter } from "./routes/app-engine.js";
import { appIntelligenceRouter } from "./routes/app-intelligence/index.js";
import { appsRouter } from "./routes/apps.js";
import { chartsRouter } from "./routes/charts.js";
import { builderRouter } from "./routes/builder.js";
import { cloneRouter } from "./routes/clone.js";
import { freshnessRouter } from "./routes/freshness.js";
import { ideasRouter } from "./routes/ideas.js";
import { keywordsRouter } from "./routes/keywords.js";
import { reviewsRouter } from "./routes/reviews.js";
import { discoveryIndex, openapiDocument } from "./lib/openapi.js";

export function createApp() {
  const app = new Hono();

  app.use("*", cors());

  app.get("/health", (c) => c.json({ ok: true }));

  // Agent-first "front door": a plain-JSON discovery index + the machine-readable
  // OpenAPI 3.1 contract. Served at the API root AND under /api/v1 so they're
  // reachable same-origin via the web app's `/api` proxy (apps/web/vite.config.ts).
  app.get("/", (c) => c.json(discoveryIndex));
  app.get("/openapi.json", (c) => c.json(openapiDocument));

  app.get("/api/v1/countries", (c) =>
    c.json({ data: SUPPORTED_COUNTRIES }),
  );

  const v1 = new Hono();
  v1.get("/", (c) => c.json(discoveryIndex));
  v1.get("/openapi.json", (c) => c.json(openapiDocument));
  v1.route("/ads", adsRouter);
  v1.route("/ai", aiRouter);
  v1.route("/audit", auditRouter);
  v1.route("/app-engine", appEngineRouter);
  v1.route("/app-intelligence", appIntelligenceRouter);
  v1.route("/apps", appsRouter);
  v1.route("/builder", builderRouter);
  v1.route("/charts", chartsRouter);
  v1.route("/clone", cloneRouter);
  v1.route("/freshness", freshnessRouter);
  v1.route("/ideas", ideasRouter);
  v1.route("/keywords", keywordsRouter);
  v1.route("/reviews", reviewsRouter);
  app.route("/api/v1", v1);

  return app;
}
