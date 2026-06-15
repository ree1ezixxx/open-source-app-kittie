import { Hono } from "hono";
import { cors } from "hono/cors";
import { SUPPORTED_COUNTRIES } from "./mock/fixtures.js";
import { adsRouter } from "./routes/ads.js";
import { aiRouter } from "./routes/ai.js";
import { appEngineRouter } from "./routes/app-engine.js";
import { appsRouter } from "./routes/apps.js";
import { chartsRouter } from "./routes/charts.js";
import { builderRouter } from "./routes/builder.js";
import { cloneRouter } from "./routes/clone.js";
import { freshnessRouter } from "./routes/freshness.js";
import { ideasRouter } from "./routes/ideas.js";
import { keywordsRouter } from "./routes/keywords.js";
import { organicRouter } from "./routes/organic.js";
import { reviewsRouter } from "./routes/reviews.js";

export function createApp() {
  const app = new Hono();

  app.use("*", cors());

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/api/v1/countries", (c) =>
    c.json({ data: SUPPORTED_COUNTRIES }),
  );

  const v1 = new Hono();
  v1.route("/ads", adsRouter);
  v1.route("/ai", aiRouter);
  v1.route("/app-engine", appEngineRouter);
  v1.route("/apps", appsRouter);
  v1.route("/builder", builderRouter);
  v1.route("/charts", chartsRouter);
  v1.route("/clone", cloneRouter);
  v1.route("/freshness", freshnessRouter);
  v1.route("/ideas", ideasRouter);
  v1.route("/keywords", keywordsRouter);
  v1.route("/organic", organicRouter);
  v1.route("/reviews", reviewsRouter);
  app.route("/api/v1", v1);

  return app;
}
