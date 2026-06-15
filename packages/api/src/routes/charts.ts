import { getTopCharts } from "@kittie/db";
import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../lib/db.js";

/* ============================================================
   GET /api/v1/charts — Trending "Store Rankings", computed on read from
   chart-bearing snapshots. Resolves the latest clean overall ranking per
   store+type+country and attaches each app's day-over-day rank movement.
   Overall requests with no clean source render empty (date:null) — honest,
   never a fabricated chart.
   ============================================================ */

export const chartsRouter = new Hono();

const chartQuerySchema = z.object({
  store: z.enum(["apple", "google"]),
  type: z.enum(["free", "paid", "grossing"]).default("free"),
  country: z.string().default("US"),
  category: z.string().optional(),
  date: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(100),
});

chartsRouter.get("/", async (c) => {
  const parsed = chartQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const result = await getTopCharts(getDb(), parsed.data);
  return c.json({ data: result, meta: { source: "snapshots", stale: result.date === null } });
});
