import { apps, organicVideos, parseJsonArray } from "@kittie/db";
import type {
  AppListItem,
  OrganicAppGroup,
  OrganicResponse,
  OrganicSearchParams,
  OrganicVideo,
} from "@kittie/types";

import { getDb } from "../lib/db.js";
import { getAppListItemsByIds } from "./db-app-service.js";

function toIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

type VideoRow = typeof organicVideos.$inferSelect;

function toVideo(r: VideoRow): OrganicVideo {
  return {
    id: r.id,
    appId: r.appId,
    creatorHandle: r.creatorHandle,
    platform: r.platform,
    videoUrl: r.videoUrl,
    thumbnailUrl: r.thumbnailUrl,
    caption: r.caption,
    postedAt: toIso(r.postedAt),
    firstSeenAt: toIso(r.firstSeenAt),
    lastSeenAt: toIso(r.lastSeenAt),
  };
}

/** Sort key per group; null sinks to the bottom regardless of direction. */
function sortKey(g: OrganicAppGroup, sortBy: OrganicSearchParams["sortBy"]): number | null {
  switch (sortBy) {
    case "revenue":
      return g.app.revenueEstimate30d;
    case "installs":
      return g.app.downloadsEstimate30d;
    case "released":
      return g.app.releasedAt ? Date.parse(g.app.releasedAt) : null;
    case "videos":
    default:
      return g.videoCount;
  }
}

/**
 * App-grouped organic content: one card per App that has creator videos, with
 * the App's hydrated metrics, its store screenshots, and its videos. Paginated
 * by App (default 12/page, matching the live product). Mirrors the in-memory
 * filter/sort posture of the Ads route — the organic_videos table is small.
 */
export async function listOrganic(params: OrganicSearchParams): Promise<OrganicResponse> {
  const db = getDb();
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 12));

  // 1. Load videos, group by App.
  const videoRows = await db.select().from(organicVideos);
  const byApp = new Map<string, VideoRow[]>();
  for (const v of videoRows) {
    const list = byApp.get(v.appId);
    if (list) list.push(v);
    else byApp.set(v.appId, [v]);
  }
  if (byApp.size === 0) {
    return { data: [], pagination: { page, limit, totalCount: 0 } };
  }

  const ids = new Set(byApp.keys());

  // 2. Hydrate App metrics (reuse the scored-rows path) + screenshots. The
  //    apps full-select mirrors the Ads route's in-memory join posture (this
  //    package intentionally doesn't import drizzle-orm operators).
  const [appItems, appRows] = await Promise.all([
    getAppListItemsByIds(ids),
    db.select().from(apps),
  ]);
  const screenshotsById = new Map<string, string[]>();
  for (const a of appRows) {
    if (ids.has(a.id)) screenshotsById.set(a.id, parseJsonArray(a.screenshotUrls));
  }

  // 3. Build groups. Drop Apps with no hydrated metrics (no snapshot) so the
  //    card always renders REVENUE/INSTALLS — an inner join, like Ads.
  let groups: OrganicAppGroup[] = [];
  for (const [appId, vids] of byApp) {
    const app: AppListItem | undefined = appItems.get(appId);
    if (!app) continue;
    const videos = vids
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(toVideo);
    groups.push({
      app,
      screenshotUrls: screenshotsById.get(appId) ?? [],
      videoCount: videos.length,
      videos,
    });
  }

  // 4. Filters.
  if (params.appId) groups = groups.filter((g) => g.app.id === params.appId);

  const categories = (params.categories ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (categories.length > 0) {
    groups = groups.filter((g) => g.app.category != null && categories.includes(g.app.category));
  }

  const search = params.search?.trim().toLowerCase();
  if (search) {
    const scope = params.searchScope ?? "all";
    groups = groups.filter((g) => {
      const titleHit = g.app.title.toLowerCase().includes(search);
      const handleHit = g.videos.some((v) => v.creatorHandle.toLowerCase().includes(search));
      if (scope === "apps") return titleHit;
      if (scope === "creators") return handleHit;
      return titleHit || handleHit;
    });
  }

  if (params.minDownloads != null)
    groups = groups.filter(
      (g) => g.app.downloadsEstimate30d != null && g.app.downloadsEstimate30d >= params.minDownloads!,
    );
  if (params.maxDownloads != null)
    groups = groups.filter(
      (g) => g.app.downloadsEstimate30d != null && g.app.downloadsEstimate30d <= params.maxDownloads!,
    );
  if (params.minRevenue != null)
    groups = groups.filter(
      (g) => g.app.revenueEstimate30d != null && g.app.revenueEstimate30d >= params.minRevenue!,
    );
  if (params.maxRevenue != null)
    groups = groups.filter(
      (g) => g.app.revenueEstimate30d != null && g.app.revenueEstimate30d <= params.maxRevenue!,
    );

  // 5. Sort (null keys sink), then paginate by App.
  const dir = params.sortOrder === "asc" ? 1 : -1;
  groups.sort((a, b) => {
    const ka = sortKey(a, params.sortBy);
    const kb = sortKey(b, params.sortBy);
    if (ka == null && kb == null) return 0;
    if (ka == null) return 1;
    if (kb == null) return -1;
    return (ka - kb) * dir;
  });

  const totalCount = groups.length;
  const start = (page - 1) * limit;
  const data = groups.slice(start, start + limit);

  return { data, pagination: { page, limit, totalCount } };
}
