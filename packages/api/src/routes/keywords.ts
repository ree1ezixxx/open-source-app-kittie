import type { Store } from "@kittie/types";
import { Hono } from "hono";
import { z } from "zod";
import {
  batchKeywordDifficulty,
  getKeywordDifficulty,
  getKeywordSuggestions,
  getRelatedKeywords,
} from "../services/keyword-service.js";

export const keywordsRouter = new Hono();

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

  const result = await getKeywordDifficulty(keyword, country, store);
  return c.json({ data: result, meta: { source: "store-search" } });
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
