import { Hono } from "hono";
import { z } from "zod";

import { compareApps } from "../services/compare-service.js";
import {
  analyzeKeywordGap,
  analyzeLocalization,
  mineNicheReviews,
} from "../services/intel-service.js";

/* ============================================================
   Intelligence routes — niche review-mining, keyword gap,
   localization gap, side-by-side compare.
   ============================================================ */

export const intelRouter = new Hono();

/* ------------------------------------------------------ compare */

intelRouter.get("/compare", async (c) => {
  const ids = (c.req.query("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length < 2 || ids.length > 5)
    return c.json({ error: "Provide 2–5 app ids via ?ids=a,b,c" }, 400);
  const data = await compareApps(ids);
  return c.json({ data });
});

/* ------------------------------------------------- niche mining */

const mineSchema = z
  .object({
    appIds: z.array(z.string()).max(500).optional(),
    category: z.string().optional(),
    limit: z.number().min(100).max(50_000).optional(),
  })
  .refine((v) => (v.appIds && v.appIds.length > 0) || v.category, {
    message: "Provide appIds or category",
  });

intelRouter.post("/niche-mining", async (c) => {
  const parsed = mineSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const report = await mineNicheReviews(parsed.data);
  return c.json({ data: report });
});

/* -------------------------------------------------- keyword gap */

const gapSchema = z.object({
  subjectAppId: z.string().min(1),
  competitorAppIds: z.array(z.string().min(1)).min(1).max(10),
  country: z.string().length(2).optional(),
  store: z.enum(["apple", "google"]).optional(),
});

intelRouter.post("/keyword-gap", async (c) => {
  const parsed = gapSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const result = await analyzeKeywordGap(parsed.data);
  return c.json({ data: result });
});

/* --------------------------------------------- localization gap */

const locSchema = z.object({
  appIds: z.array(z.string()).max(50).optional(),
  store: z.enum(["apple", "google"]).optional(),
});

intelRouter.post("/localization-gap", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = locSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const result = await analyzeLocalization(parsed.data);
  return c.json({ data: result });
});
