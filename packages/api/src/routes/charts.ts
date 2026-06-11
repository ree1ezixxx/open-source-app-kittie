import { getTopCharts } from "@kittie/db";
import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../lib/db.js";

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
  return c.json({
    data: result,
    meta: { source: "snapshots", stale: result.date === null },
  });
});
