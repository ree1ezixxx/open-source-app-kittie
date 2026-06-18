import { Hono } from "hono";
import { z } from "zod";
import { apps, listAppsByIds, metaAds } from "@kittie/db";
import { getDb } from "../lib/db.js";

/**
 * Meta Ad Library creatives, joined to their app. Powers the Ads Library page.
 *
 * The join + filter + sort happens in memory: this package doesn't depend on
 * drizzle-orm (only on @kittie/db's exported helpers), and the rest of the API
 * already filters/sorts hydrated rows in JS (see services/filter-sort.ts). The
 * meta_ads table is small — ingest writes a handful of creatives per app — so we
 * load every creative, then hydrate ONLY the apps those creatives reference via a
 * bounded id lookup (never the full ~1.1M-row catalog).
 */
export const adsRouter = new Hono();

const adsQuerySchema = z.object({
  /** Restrict to one app's creatives. */
  appId: z.string().optional(),
  /** Comma-separated list matched against apps.category. */
  categories: z.string().optional(),
  /** image = has image_url, video = has video_url. */
  media: z.enum(["all", "image", "video"]).default("all"),
  /** Case-insensitive substring on ad copy or app title (LIKE semantics). */
  search: z.string().optional(),
  /** startDate → first_seen_at, endDate → last_seen_at. */
  sortBy: z.enum(["startDate", "endDate"]).default("startDate"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

type AdRow = typeof metaAds.$inferSelect;
type AppRow = typeof apps.$inferSelect;

function toIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

adsRouter.get("/", async (c) => {
  const parsed = adsQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const params = parsed.data;

  const db = getDb();
  // Meta creatives are few; load ONLY the apps they reference (bounded inArray)
  // rather than scanning the full ~1.1M-row catalog into memory on every request.
  const adRows = await db.select().from(metaAds);
  const appRows = await listAppsByIds(db, [...new Set(adRows.map((a) => a.appId))]);
  const appsById = new Map<string, AppRow>(appRows.map((a) => [a.id, a]));

  const categories = (params.categories ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const search = params.search?.trim().toLowerCase();

  let rows: Array<{ ad: AdRow; app: AppRow }> = adRows.flatMap((ad) => {
    const app = appsById.get(ad.appId);
    return app ? [{ ad, app }] : []; // inner join — drop orphaned creatives
  });

  if (params.appId) rows = rows.filter((r) => r.ad.appId === params.appId);
  if (categories.length > 0) {
    rows = rows.filter((r) => r.app.category != null && categories.includes(r.app.category));
  }
  if (params.media === "image") rows = rows.filter((r) => r.ad.imageUrl != null);
  if (params.media === "video") rows = rows.filter((r) => r.ad.videoUrl != null);
  if (search) {
    rows = rows.filter(
      (r) =>
        (r.ad.adCopy ?? "").toLowerCase().includes(search) ||
        r.app.title.toLowerCase().includes(search),
    );
  }

  // Sort by the chosen seen-date; rows without one always sink to the bottom.
  const sortKey = (r: { ad: AdRow }): number | null => {
    const d = params.sortBy === "endDate" ? r.ad.lastSeenAt : r.ad.firstSeenAt;
    return d ? d.getTime() : null;
  };
  const dir = params.sortOrder === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    if (ka == null && kb == null) return 0;
    if (ka == null) return 1;
    if (kb == null) return -1;
    return (ka - kb) * dir;
  });

  const totalCount = rows.length;
  const start = (params.page - 1) * params.limit;
  const data = rows.slice(start, start + params.limit).map(({ ad, app }) => ({
    id: ad.id,
    appId: ad.appId,
    adLibraryId: ad.adLibraryId,
    adCopy: ad.adCopy,
    imageUrl: ad.imageUrl,
    videoUrl: ad.videoUrl,
    status: ad.status,
    firstSeenAt: toIso(ad.firstSeenAt),
    lastSeenAt: toIso(ad.lastSeenAt),
    app: {
      id: app.id,
      title: app.title,
      developer: app.developer,
      iconUrl: app.iconUrl,
      category: app.category,
    },
  }));

  return c.json({
    data,
    pagination: { page: params.page, limit: params.limit, totalCount },
  });
});
