import { Hono } from "hono";
import { z } from "zod";
import { reviewCountsByApp } from "@kittie/db";
import { getAppReviews } from "../services/app-service.js";
import { getDb } from "../lib/db.js";

export const reviewsRouter = new Hono();

/** Indexed review counts per app (?ids=a,b,c) — powers the rail's real
    coverage number instead of the store's listing total. */
reviewsRouter.get("/counts", async (c) => {
  const ids = (c.req.query("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const counts = await reviewCountsByApp(getDb(), ids);
  return c.json({ data: counts });
});

const reviewRequestSchema = z.object({
  appId: z.string(),
  country: z.string().default("US"),
  // Raised to 500 (our per-app sync depth) so the feed + period filters span
  // real history, not just the newest ~100 reviews.
  limit: z.number().min(1).max(500).default(20),
});

reviewsRouter.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = reviewRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const allReviews = await getAppReviews(parsed.data.appId);
  // Filter by country if specified (case-insensitive; defaults to all if empty/null)
  const filtered = parsed.data.country
    ? allReviews.filter((r) => r.country.toLowerCase() === parsed.data.country.toLowerCase())
    : allReviews;
  const reviews = filtered.slice(0, parsed.data.limit);
  return c.json({
    data: reviews,
    meta: { source: "cache", stale: reviews.length === 0 },
  });
});
