import { Hono } from "hono";
import { z } from "zod";
import { syncOrganic } from "@kittie/ingest";

import { getDb } from "../lib/db.js";
import { listOrganic } from "../services/organic-service.js";

/**
 * Organic Content — Apps with creator/UGC videos, grouped by App. The organic
 * counterpart to the Ads Library. GET lists app-grouped cards; POST /refresh
 * re-runs the live ingest in-process (the "Refresh organic content" button),
 * the same seam pattern as POST /apps/:id/sync-reviews.
 */
export const organicRouter = new Hono();

const querySchema = z.object({
  appId: z.string().optional(),
  categories: z.string().optional(),
  search: z.string().optional(),
  searchScope: z.enum(["all", "apps", "creators"]).default("all"),
  minDownloads: z.coerce.number().optional(),
  maxDownloads: z.coerce.number().optional(),
  minRevenue: z.coerce.number().optional(),
  maxRevenue: z.coerce.number().optional(),
  sortBy: z.enum(["videos", "revenue", "installs", "released"]).default("videos"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(12),
});

organicRouter.get("/", async (c) => {
  const parsed = querySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const result = await listOrganic(parsed.data);
  return c.json(result);
});

organicRouter.post("/refresh", async (c) => {
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 20)));
  const result = await syncOrganic(getDb(), { limit });
  return c.json({ data: result });
});
