import { Hono } from "hono";
import {
  getIdeaByStoreAppId,
  listIdeaFacets,
  listIdeas,
  listSimilarIdeas,
  type AppIdea,
  type IdeaSort,
} from "@kittie/db";

import { getDb } from "../lib/db.js";

const SORTS: ReadonlySet<string> = new Set([
  "created",
  "released",
  "reviews",
  "downloads",
  "revenue",
  "rating",
  "price",
]);

/** Wire shape: blueprint JSON parsed, timestamps ISO. */
function toWire(idea: AppIdea) {
  return {
    id: idea.id,
    slug: idea.slug,
    storeAppId: null as string | null, // filled by detail; list rows join below
    sourceAppId: idea.sourceAppId,
    title: idea.title,
    summary: idea.summary,
    sourceCategory: idea.sourceCategory,
    ideaCategory: idea.ideaCategory,
    needsBackend: idea.needsBackend,
    needsDatabase: idea.needsDatabase,
    needsAi: idea.needsAi,
    blueprint: JSON.parse(idea.blueprint) as unknown,
    reviews: idea.reviewCount,
    rating: idea.rating,
    downloads: idea.downloadsEstimate,
    revenue: idea.revenueEstimate,
    price: idea.price,
    releasedAt: idea.releasedAt?.toISOString() ?? null,
    createdAt: idea.createdAt.toISOString(),
  };
}

export const ideasRouter = new Hono();

ideasRouter.get("/", async (c) => {
  const q = c.req.query();
  const sort = SORTS.has(q.sort ?? "") ? (q.sort as IdeaSort) : "created";
  const result = await listIdeas(getDb(), {
    search: q.search || undefined,
    sourceCategory: q.sourceCategory || undefined,
    ideaCategory: q.ideaCategory || undefined,
    needsBackend: q.blueprint?.split(",").includes("backend") || undefined,
    needsDatabase: q.blueprint?.split(",").includes("database") || undefined,
    needsAi: q.blueprint?.split(",").includes("ai") || undefined,
    sort,
    order: q.order === "asc" ? "asc" : "desc",
    page: q.page ? Number(q.page) : 1,
    pageSize: q.pageSize ? Number(q.pageSize) : 12,
  });
  return c.json({
    data: {
      ideas: result.ideas.map((r) => ({ ...toWire(r), storeAppId: r.storeAppId })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      pageCount: result.pageCount,
    },
  });
});

ideasRouter.get("/facets", async (c) => {
  return c.json({ data: await listIdeaFacets(getDb()) });
});

/** Detail by source-app store id — the stable token in /app-<slug>-id<storeAppId>. */
ideasRouter.get("/:storeAppId", async (c) => {
  const db = getDb();
  const found = await getIdeaByStoreAppId(db, c.req.param("storeAppId"));
  if (!found) return c.json({ error: "idea not found" }, 404);

  const { idea, sourceApp } = found;
  const similar = await listSimilarIdeas(db, idea.sourceCategory, idea.id);
  return c.json({
    data: {
      idea: { ...toWire(idea), storeAppId: sourceApp.storeAppId },
      sourceApp: {
        id: sourceApp.id,
        store: sourceApp.store,
        storeAppId: sourceApp.storeAppId,
        title: sourceApp.title,
        developer: sourceApp.developer,
        category: sourceApp.category,
        iconUrl: sourceApp.iconUrl,
        price: sourceApp.price,
        rating: idea.rating,
        reviews: idea.reviewCount,
        downloads: idea.downloadsEstimate,
        revenue: idea.revenueEstimate,
      },
      similar: similar.map(toWire),
    },
  });
});
