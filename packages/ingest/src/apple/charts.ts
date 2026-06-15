import type { ChartType } from "@kittie/types";
import { encodeChartCategory } from "@kittie/db";
import { sleep } from "../util/rate-limit.js";

export interface AppleChartEntry {
  storeAppId: string;
  title: string;
  developer: string;
  iconUrl: string | null;
  category: string | null;
  chartCategory: string;
  chartRank: number;
  chartCountry: string;
}

interface AppleChartFeed {
  feed?: {
    results?: Array<{
      id: string;
      name: string;
      artistName: string;
      artworkUrl100?: string;
      genres?: Array<{ name: string }>;
    }>;
  };
}

const APPLE_CHART_FEEDS: Array<{ type: ChartType; path: string }> = [
  { type: "free", path: "top-free" },
  { type: "paid", path: "top-paid" },
];

/** Legacy iTunes RSS genre IDs — the modern marketing-tools API has no per-genre charts. */
const APPLE_GENRES: Array<[string, number]> = [
  ["Books", 6018], ["Business", 6000], ["Developer Tools", 6026], ["Education", 6017],
  ["Entertainment", 6016], ["Finance", 6015], ["Food & Drink", 6023], ["Games", 6014],
  ["Graphics & Design", 6027], ["Health & Fitness", 6013], ["Lifestyle", 6012],
  ["Medical", 6020], ["Music", 6011], ["Navigation", 6010], ["News", 6009],
  ["Photo & Video", 6008], ["Productivity", 6007], ["Reference", 6006], ["Shopping", 6024],
  ["Social Networking", 6005], ["Sports", 6004], ["Travel", 6003], ["Utilities", 6002],
  ["Weather", 6001],
];

/**
 * The three iTunes-RSS chart feeds, each available at BOTH overall (no genre
 * param) and per-genre granularity. Capturing all three types at both levels is
 * what fills the Store-Rankings grid — `top-paid` and `top-grossing` previously
 * had only partial coverage (paid was overall-only, grossing per-genre-only),
 * leaving "Top Paid + a category" and "Top Grossing + All categories" empty.
 */
const RSS_TYPE_FEEDS: Array<{ type: ChartType; path: string }> = [
  { type: "free", path: "topfreeapplications" },
  { type: "paid", path: "toppaidapplications" },
  { type: "grossing", path: "topgrossingapplications" },
];

interface LegacyChartFeed {
  feed?: {
    entry?:
      | Array<LegacyChartEntry>
      | LegacyChartEntry; // a single-entry feed deserialises as an object, not an array
  };
}

interface LegacyChartEntry {
  id?: { attributes?: { "im:id"?: string } };
  "im:name"?: { label?: string };
  "im:artist"?: { label?: string };
  "im:image"?: Array<{ label?: string }>;
}

/** Context attached to every parsed row — the chart identity the feed represents. */
export interface RssChartContext {
  type: ChartType;
  /** App Store genre name, or null for the overall (no-genre) chart. */
  genre: string | null;
  /** Lowercase storefront, e.g. "us". */
  country: string;
}

/**
 * Pure parse of one iTunes-RSS chart feed JSON into ranked {@link AppleChartEntry}
 * rows. The `chart_category` is packed via the shared codec so it round-trips
 * back through `assembleTopCharts`. Tolerant of the single-entry-as-object feed
 * shape; rows missing a store id are dropped. Network-free so it can be tested
 * against a captured fixture.
 */
export function parseRssChartFeed(
  data: LegacyChartFeed,
  ctx: RssChartContext,
): AppleChartEntry[] {
  const raw = data.feed?.entry;
  const items: LegacyChartEntry[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const chartCategory = encodeChartCategory({ type: ctx.type, genre: ctx.genre });
  const country = ctx.country.toUpperCase();

  const entries: AppleChartEntry[] = [];
  items.forEach((item, index) => {
    const storeAppId = item.id?.attributes?.["im:id"];
    if (!storeAppId) return;
    entries.push({
      storeAppId,
      title: item["im:name"]?.label ?? "",
      developer: item["im:artist"]?.label ?? "",
      iconUrl: item["im:image"]?.at(-1)?.label ?? null,
      category: ctx.genre,
      chartCategory,
      chartRank: index + 1,
      chartCountry: country,
    });
  });
  return entries;
}

const RSS_THROTTLE_MS = 250;

/**
 * US charts via the legacy iTunes RSS — the only free source of per-genre rank
 * positions and the source we use to fill the full grid: all 3 chart types
 * (`free | paid | grossing`) at BOTH the overall chart and every genre.
 *
 * ~75 paced requests; a failing feed is skipped, never fabricated. Dedup is per
 * (type, app): the same app can appear once per chart type, but not twice within
 * a type (its first, most prestigious rank for that type wins).
 *
 * Feed *ordering* matters downstream. A snapshot stores only one chart
 * membership per app/day (`app_snapshots` is unique on app+date), so when the
 * merge in `chart-lookup.ts` collapses an app to a single membership, the
 * earliest-emitted entry wins. We therefore emit the scarcer charts first —
 * per-genre `paid`/`grossing` (which a handful of apps populate and which the
 * grid most needs filled), then the overall charts, then per-genre `free`
 * (densely covered, last to claim an app). This maximises how many distinct
 * type×category cells end up non-empty.
 */
export async function fetchAppleGenreCharts(
  country = "us",
  limit = 100,
): Promise<AppleChartEntry[]> {
  const entries: AppleChartEntry[] = [];
  const seen = new Set<string>();

  const collect = (parsed: AppleChartEntry[], type: ChartType): void => {
    for (const entry of parsed) {
      // Dedup per (type, app): an app already ranked for this type in an earlier
      // feed keeps that (more prestigious / overall) position.
      const key = `${type}:${entry.storeAppId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(entry);
    }
  };

  const fetchFeed = async (
    type: ChartType,
    path: string,
    genreName: string | null,
    genreId: number | null,
  ): Promise<void> => {
    const genreSegment = genreId != null ? `/genre=${genreId}` : "";
    const url = `https://itunes.apple.com/${country}/rss/${path}/limit=${limit}${genreSegment}/json`;
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok) return;
      const data = (await response.json()) as LegacyChartFeed;
      collect(parseRssChartFeed(data, { type, genre: genreName, country }), type);
    } catch {
      // one feed failing must not abort the sweep
    }
    await sleep(RSS_THROTTLE_MS);
  };

  const byType = (t: ChartType) => RSS_TYPE_FEEDS.find((f) => f.type === t)!;

  // 1) Scarce per-genre paid & grossing first — these are the cells that render
  //    empty today, so they get first claim on any shared app.
  for (const type of ["paid", "grossing"] as const) {
    const feed = byType(type);
    for (const [genreName, genreId] of APPLE_GENRES) {
      await fetchFeed(type, feed.path, genreName, genreId);
    }
  }

  // 2) Overall charts (all three types) — clean 1..N rankings for the "All
  //    categories" tab. Emitted overall-first within each type already.
  for (const type of ["free", "paid", "grossing"] as const) {
    const feed = byType(type);
    await fetchFeed(type, feed.path, null, null);
  }

  // 3) Per-genre free last — densely covered, so it claims only apps not already
  //    held by a scarcer chart above.
  {
    const feed = byType("free");
    for (const [genreName, genreId] of APPLE_GENRES) {
      await fetchFeed("free", feed.path, genreName, genreId);
    }
  }

  return entries;
}

export async function fetchAppleCharts(
  country = "us",
  limit = 100,
): Promise<AppleChartEntry[]> {
  const entries: AppleChartEntry[] = [];
  const seen = new Set<string>();

  for (const feed of APPLE_CHART_FEEDS) {
    const url = `https://rss.applemarketingtools.com/api/v2/${country}/apps/${feed.path}/${limit}/apps.json`;
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) {
      console.warn(`Apple chart fetch skipped (${feed.path}): ${response.status}`);
      continue;
    }

    const data = (await response.json()) as AppleChartFeed;
    const results = data.feed?.results ?? [];

    results.forEach((item, index) => {
      if (seen.has(item.id)) return;
      seen.add(item.id);

      entries.push({
        storeAppId: item.id,
        title: item.name,
        developer: item.artistName,
        iconUrl: item.artworkUrl100 ?? null,
        category: item.genres?.[0]?.name ?? null,
        chartCategory: encodeChartCategory({ type: feed.type, genre: null }),
        chartRank: index + 1,
        chartCountry: country.toUpperCase(),
      });
    });
  }

  return entries;
}
