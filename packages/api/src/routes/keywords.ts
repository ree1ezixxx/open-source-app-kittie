import type { Store } from "@kittie/types";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import {
  addTrackedKeyword,
  batchKeywordDifficulty,
  getKeywordDifficulty,
  getKeywordMarkets,
  getKeywordSuggestions,
  getRelatedKeywords,
  listTracked,
  removeTrackedKeyword,
  SUPPORTED_MARKETS,
} from "../services/keyword-service.js";
import {
  addTrackedApp,
  listTracked as listTrackedApps,
  removeTrackedApp,
} from "../services/tracked-app-service.js";

export const keywordsRouter = new Hono();

// The durable tracked-apps list for App Tracking (survives reload). PRD #20.
// Persist-only: adding an app records it; keyword generation + rank ingestion
// land in later slices (#23/#24).
keywordsRouter.get("/tracked-apps", async (c) => {
  const data = await listTrackedApps();
  return c.json({ data, meta: { source: "tracked-apps", count: data.length } });
});

keywordsRouter.post("/tracked-apps", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const appId = typeof body.appId === "string" ? body.appId.trim() : "";
  const country = (typeof body.country === "string" && body.country.trim()) || "US";
  if (!appId) return c.json({ error: "appId is required" }, 400);

  const data = await addTrackedApp(appId, country.toUpperCase());
  if (!data) return c.json({ error: "app not found" }, 404);
  return c.json({ data, meta: { source: "tracked-apps" } });
});

keywordsRouter.delete("/tracked-apps", async (c) => {
  const appId = c.req.query("appId");
  const country = (c.req.query("country") ?? "US").toUpperCase();
  const store = (c.req.query("store") === "google" ? "google" : "apple") as Store;
  if (!appId) return c.json({ error: "appId is required" }, 400);

  await removeTrackedApp(appId, store, country);
  return c.json({ data: { removed: true }, meta: { source: "tracked-apps" } });
});

// The durable tracked-keyword shortlist (survives reload). See ADR 0003.
keywordsRouter.get("/tracked", async (c) => {
  const data = await listTracked();
  return c.json({ data, meta: { source: "tracked-shortlist", count: data.length } });
});

keywordsRouter.post("/tracked", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
  const country = (typeof body.country === "string" && body.country) || "US";
  const store = (body.store === "google" ? "google" : "apple") as Store;
  if (!keyword) return c.json({ error: "keyword is required" }, 400);

  const data = await addTrackedKeyword(keyword, country, store);
  return c.json({ data, meta: { source: "tracked-shortlist" } });
});

keywordsRouter.delete("/tracked", async (c) => {
  const keyword = c.req.query("keyword");
  const country = c.req.query("country") ?? "US";
  const store = (c.req.query("store") ?? "apple") as Store;
  if (!keyword) return c.json({ error: "keyword is required" }, 400);

  await removeTrackedKeyword(keyword, country, store);
  return c.json({ data: { removed: true }, meta: { source: "tracked-shortlist" } });
});

keywordsRouter.get("/suggestions", async (c) => {
  const storeParam = c.req.query("store");
  const store =
    storeParam === "apple" || storeParam === "google" ? storeParam : undefined;
  const limit = Math.min(Number(c.req.query("limit") ?? 20) || 20, 50);

  const { suggestions, appCount } = await getKeywordSuggestions(store, limit);
  return c.json({
    data: suggestions,
    meta: { country: "US", appCount, source: "tracked-apps" },
  });
});

keywordsRouter.get("/difficulty", async (c) => {
  const keyword = c.req.query("keyword");
  const country = c.req.query("country") ?? "US";
  const store = (c.req.query("store") ?? "apple") as Store;

  if (!keyword) return c.json({ error: "keyword is required" }, 400);

  const forceRefresh = c.req.query("refresh") === "true" || c.req.query("refresh") === "1";
  const result = await getKeywordDifficulty(keyword, country, store, { forceRefresh });
  return c.json({ data: result, meta: { source: "store-search", refreshed: forceRefresh } });
});

// Related keyword ideas for a seed (autocomplete only; client scores via batch).
keywordsRouter.get("/related", async (c) => {
  const keyword = c.req.query("keyword");
  const country = c.req.query("country") ?? "US";
  const store = (c.req.query("store") ?? "apple") as Store;
  const limit = Math.min(Number(c.req.query("limit") ?? 20) || 20, 30);

  if (!keyword) return c.json({ error: "keyword is required" }, 400);

  const data = await getRelatedKeywords(keyword, country, store, limit);
  return c.json({ data, meta: { source: "store-autocomplete", seed: keyword } });
});

// Cross-market metrics for one keyword (the opportunity finder behind row-expand).
keywordsRouter.get("/markets", async (c) => {
  const keyword = c.req.query("keyword");
  const store = (c.req.query("store") ?? "apple") as Store;
  const countriesParam = c.req.query("countries");

  if (!keyword) return c.json({ error: "keyword is required" }, 400);

  const countries = countriesParam
    ? countriesParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 16)
    : SUPPORTED_MARKETS;

  const data = await getKeywordMarkets(keyword, store, countries);
  return c.json({ data, meta: { source: "store-search", keyword, markets: SUPPORTED_MARKETS } });
});

/**
 * Streaming cross-market analysis (Keyword Explorer exact-clone async path):
 * the keyword shows instantly as Pending client-side; each market's score is
 * emitted the moment it's computed (market → … → done), paced sequentially so
 * 26 markets never hammer the stores. Each result is persisted by the
 * underlying lookup cache, so a dropped stream loses nothing.
 */
keywordsRouter.get("/markets/stream", (c) => {
  const keyword = c.req.query("keyword");
  const store = (c.req.query("store") ?? "apple") as Store;
  const countriesParam = c.req.query("countries");
  const valid = new Set<string>(SUPPORTED_MARKETS);
  const countries = (countriesParam ? countriesParam.split(",") : [...SUPPORTED_MARKETS])
    .map((s) => s.trim().toUpperCase())
    .filter((s) => valid.has(s))
    .slice(0, SUPPORTED_MARKETS.length);

  return streamSSE(c, async (stream) => {
    if (!keyword) {
      await stream.writeSSE({ event: "error", data: JSON.stringify({ message: "keyword is required" }) });
      return;
    }
    await stream.writeSSE({
      event: "start",
      data: JSON.stringify({ keyword, store, total: countries.length }),
    });
    let done = 0;
    for (const country of countries) {
      try {
        const kd = await getKeywordDifficulty(keyword, country, store);
        done++;
        await stream.writeSSE({
          event: "market",
          data: JSON.stringify({
            country,
            popularity: kd.popularity,
            difficulty: kd.difficulty,
            competingAppCount: kd.competingAppCount,
            opportunityScore: kd.opportunityScore,
            done,
            total: countries.length,
          }),
        });
      } catch {
        done++;
        await stream.writeSSE({
          event: "market_failed",
          data: JSON.stringify({ country, done, total: countries.length }),
        });
      }
    }
    await stream.writeSSE({ event: "done", data: JSON.stringify({ done, total: countries.length }) });
  });
});

const batchSchema = z.object({
  keywords: z
    .array(
      z.object({
        keyword: z.string(),
        country: z.string().default("US"),
        store: z.enum(["apple", "google"]).default("apple"),
      }),
    )
    .min(1)
    .max(25),
});

keywordsRouter.post("/difficulty", async (c) => {
  const body = await c.req.json();
  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const data = await batchKeywordDifficulty(parsed.data.keywords);
  return c.json({ data, meta: { source: "store-search" } });
});
