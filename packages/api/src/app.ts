import { Hono } from "hono";
import { cors } from "hono/cors";
import { countApps } from "@kittie/db";
import { SUPPORTED_COUNTRIES } from "./mock/fixtures.js";
import { appsRouter } from "./routes/apps.js";
import { keywordsRouter } from "./routes/keywords.js";
import { reviewsRouter } from "./routes/reviews.js";
import { getDb } from "./lib/db.js";

export function createApp() {
  const app = new Hono();

  app.use("*", cors());

  app.get("/health", async (c) => {
    try {
      const appCount = await countApps(getDb());
      return c.json({ ok: true, appCount });
    } catch {
      // Database not ready, but API is alive
      return c.json({ ok: true, appCount: 0 });
    }
  });

  app.get("/api/v1/countries", (c) =>
    c.json({ data: SUPPORTED_COUNTRIES }),
  );

  const v1 = new Hono();
  v1.route("/apps", appsRouter);
  v1.route("/keywords", keywordsRouter);
  v1.route("/reviews", reviewsRouter);
  app.route("/api/v1", v1);

  return app;
}
