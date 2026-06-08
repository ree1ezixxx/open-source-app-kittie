import { Hono } from "hono";
import { z } from "zod";
import { getAppReviews } from "../services/app-service.js";

export const reviewsRouter = new Hono();

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

  const reviews = (await getAppReviews(parsed.data.appId)).slice(0, parsed.data.limit);
  return c.json({
    data: reviews,
    meta: { source: "cache", stale: reviews.length === 0 },
  });
});
