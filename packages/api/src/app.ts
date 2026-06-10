import { Hono } from "hono";
import { cors } from "hono/cors";
import { SUPPORTED_COUNTRIES } from "./mock/fixtures.js";
import { adsRouter } from "./routes/ads.js";
import { appsRouter } from "./routes/apps.js";
import { keywordsRouter } from "./routes/keywords.js";
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
  v1.route("/apps", appsRouter);
  v1.route("/keywords", keywordsRouter);
  v1.route("/reviews", reviewsRouter);
  app.route("/api/v1", v1);

  return app;
}
