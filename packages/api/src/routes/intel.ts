import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { appTitlesByIds, listAppIdsByCategory, reviewFreshnessByApp } from "@kittie/db";

import { getDb } from "../lib/db.js";
import { compareApps } from "../services/compare-service.js";
import {
  analyzeKeywordGap,
  analyzeLocalization,
  mineNicheReviews,
} from "../services/intel-service.js";
import { syncAppReviews } from "../services/review-sync-service.js";

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

/**
 * Freshness-contract mining (CONTEXT.md): sync-then-mine over SSE.
 * Resolves the niche scope, live-syncs every App whose reviews are staler
 * than the cadence (paced, real progress events), THEN mines — today's
 * market, with the wait shown honestly.
 *
 * Events: scope {apps, toSync} → sync {i, total, appId, title, synced}
 *         → mining → report {<NicheReport>, syncedAt} → done | error.
 */
intelRouter.get("/niche-mining/stream", (c) => {
  const category = c.req.query("category")?.trim();
  const idsParam = (c.req.query("appIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const staleHours = Math.min(Math.max(Number(c.req.query("staleHours") ?? 24) || 24, 0), 24 * 7);
  // Politeness cap: a cold 100-app category would mean ~10 min of fetching;
  // sync the most-stale slice and SAY so rather than silently skipping.
  const maxSync = Math.min(Number(c.req.query("maxSync") ?? 30) || 30, 60);

  return streamSSE(c, async (stream) => {
    let chain: Promise<void> = Promise.resolve();
    const send = (event: string, data: unknown): Promise<void> => {
      chain = chain.then(() => stream.writeSSE({ event, data: JSON.stringify(data) }));
      return chain;
    };

    try {
      const db = getDb();
      const appIds =
        idsParam.length > 0
          ? idsParam
          : category
            ? await listAppIdsByCategory(db, category)
            : [];
      if (appIds.length === 0) {
        await send("error", { message: "Provide appIds or a known category" });
        return;
      }

      // Stale = never synced, or last ingest older than the cadence.
      const fresh = await reviewFreshnessByApp(db, appIds);
      const cutoff = Math.floor(Date.now() / 1000) - staleHours * 3600;
      const stale = appIds
        .map((id) => ({ id, last: fresh.get(id) ?? 0 }))
        .filter((a) => a.last < cutoff)
        .sort((a, b) => a.last - b.last);
      const toSync = stale.slice(0, maxSync);
      const titles = await appTitlesByIds(db, toSync.map((a) => a.id));

      await send("scope", {
        apps: appIds.length,
        toSync: toSync.length,
        capped: stale.length > toSync.length ? stale.length - toSync.length : 0,
      });

      let i = 0;
      for (const { id } of toSync) {
        i++;
        await send("sync", { i, total: toSync.length, appId: id, title: titles.get(id) ?? id });
        try {
          await syncAppReviews(id);
        } catch {
          /* one app failing must not abort the answer */
        }
      }

      await send("mining", {});
      const report = await mineNicheReviews({
        appIds: idsParam.length > 0 ? idsParam : undefined,
        category: idsParam.length > 0 ? undefined : category,
      });
      await send("report", { ...report, syncedAt: new Date().toISOString() });
      await chain;
      await send("done", {});
    } catch (e) {
      await send("error", { message: e instanceof Error ? e.message : "Mining failed" });
    }
  });
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
