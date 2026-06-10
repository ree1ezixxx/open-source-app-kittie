/**
 * Steam collectors — public, keyless, stable endpoints only.
 *
 * - App list: https://api.steampowered.com/ISteamApps/GetAppList/v2/
 * - Per-app details: https://store.steampowered.com/api/appdetails (the
 *   storefront JSON the Steam web client itself uses; undocumented but stable
 *   for years and widely consumed).
 *
 * Rate limits: appdetails is throttled to roughly 200 requests per 5 minutes
 * per IP. Callers MUST pace sequential calls — the multistore seed job
 * defaults to a 1500ms gap. This module deliberately contains no pacing of
 * its own; one function call = one request.
 *
 * Honesty: every field maps 1:1 from the Steam response. Missing data is
 * null/empty — never fabricated.
 */

export interface SteamAppListEntry {
  appid: number;
  name: string;
}

export interface SteamAppMetadata {
  /** Steam appid as a string — apps.id becomes `steam:${storeAppId}`. */
  storeAppId: string;
  title: string;
  /** developers[0], falling back to publishers[0], else "Unknown". */
  developer: string;
  /** First genre description, e.g. "Action". Null when Steam sends none. */
  category: string | null;
  /** Steam header capsule image (460x215) — closest thing to an icon. */
  iconUrl: string | null;
  description: string | null;
  websiteUrl: string | null;
  /** USD. price_overview.final / 100; 0 when is_free; null when unknown. */
  price: number | null;
  /** `${required_age}+` when required_age > 0, else null. */
  contentRating: string | null;
  /** Thumbnail URLs, capped at 10. Empty when Steam sends none. */
  screenshotUrls: string[];
  /** Parsed release_date.date. Null for "Coming soon" / unparseable strings. */
  releasedAt: Date | null;
  /** recommendations.total — Steam review count proxy. 0 when absent. */
  reviewCount: number;
  /**
   * Always null. Steam has no 5-star rating scale — only a positive/negative
   * review ratio that does NOT map onto the apps.rating column's semantics.
   * Do not invent a conversion.
   */
  rating: null;
}

interface RawAppListResponse {
  applist?: {
    apps?: Array<{ appid?: number; name?: string }>;
  };
}

interface RawAppDetailsData {
  type?: string;
  name?: string;
  is_free?: boolean;
  short_description?: string;
  header_image?: string;
  website?: string | null;
  developers?: string[];
  publishers?: string[];
  required_age?: number | string;
  price_overview?: { final?: number };
  genres?: Array<{ description?: string }>;
  screenshots?: Array<{ path_thumbnail?: string }>;
  release_date?: { coming_soon?: boolean; date?: string };
  recommendations?: { total?: number };
}

type RawAppDetailsResponse = Record<
  string,
  { success?: boolean; data?: RawAppDetailsData } | undefined
>;

const FEATURED_URL = "https://store.steampowered.com/api/featuredcategories?cc=us&l=en";
const APP_DETAILS_URL = "https://store.steampowered.com/api/appdetails";

interface RawFeaturedResponse {
  top_sellers?: { items?: Array<{ id?: number; name?: string }> };
  new_releases?: { items?: Array<{ id?: number; name?: string }> };
  specials?: { items?: Array<{ id?: number; name?: string }> };
  coming_soon?: { items?: Array<{ id?: number; name?: string }> };
}

/**
 * Fetch a seed list of Steam appids (no API key required).
 *
 * The classic ISteamApps/GetAppList v2 endpoint now 404s (retired; its
 * IStoreService replacement requires a key), so this uses the storefront's
 * featuredcategories feed instead: top sellers + new releases + specials —
 * ~50 unique, *relevant* games per call, which is a better indie-intel seed
 * than the old raw 200k dump anyway. Whether an entry is truly a game is
 * still confirmed by the follow-up `fetchSteamAppDetails` call.
 */
export async function fetchSteamAppList(opts?: {
  limit?: number;
}): Promise<SteamAppListEntry[]> {
  const res = await fetch(FEATURED_URL);
  if (!res.ok) {
    throw new Error(`Steam featured-categories request failed: HTTP ${res.status}`);
  }

  const json = (await res.json()) as RawFeaturedResponse;
  const buckets = [
    json.top_sellers?.items ?? [],
    json.new_releases?.items ?? [],
    json.specials?.items ?? [],
    json.coming_soon?.items ?? [],
  ];

  const seen = new Set<number>();
  const entries: SteamAppListEntry[] = [];
  for (const bucket of buckets) {
    for (const item of bucket) {
      if (typeof item?.id !== "number" || seen.has(item.id)) continue;
      const name = typeof item.name === "string" ? item.name.trim() : "";
      if (name.length === 0) continue;
      seen.add(item.id);
      entries.push({ appid: item.id, name });
      if (opts?.limit !== undefined && entries.length >= opts.limit) return entries;
    }
  }

  return entries;
}

/** short_description arrives HTML-entity-encoded (e.g. `&quot;`) — decode it. */
function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Steam sends locale-ish strings ("21 Aug, 2012", "Coming soon", "2024"). */
function parseSteamReleaseDate(raw: string | undefined): Date | null {
  const value = raw?.trim();
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function parseRequiredAge(raw: number | string | undefined): number {
  if (raw === undefined) return 0;
  const age = typeof raw === "number" ? raw : Number.parseInt(raw, 10);
  return Number.isFinite(age) && age > 0 ? age : 0;
}

/**
 * Fetch storefront details for one Steam appid.
 *
 * Returns null (not an error) when Steam reports `success: false` or the
 * entry is not a game (`type !== "game"` — filters DLC, soundtracks, demos,
 * tools). Throws only on transport/HTTP failures so callers can distinguish
 * "skip this app" from "back off".
 *
 * Rate limit: ~200 requests / 5 minutes per IP — pace sequential calls.
 */
export async function fetchSteamAppDetails(
  appid: number,
): Promise<SteamAppMetadata | null> {
  const url = `${APP_DETAILS_URL}?appids=${appid}&cc=us&l=en`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Steam appdetails request failed for ${appid}: HTTP ${res.status}`);
  }

  const json = (await res.json()) as RawAppDetailsResponse;
  const entry = json[String(appid)];
  if (!entry?.success || !entry.data) return null;

  const data = entry.data;
  if (data.type !== "game") return null;

  const title = data.name?.trim();
  if (!title) return null;

  const requiredAge = parseRequiredAge(data.required_age);

  const screenshotUrls = (data.screenshots ?? [])
    .map((shot) => shot.path_thumbnail)
    .filter((thumb): thumb is string => typeof thumb === "string" && thumb.length > 0)
    .slice(0, 10);

  let price: number | null = null;
  if (data.price_overview) {
    price =
      typeof data.price_overview.final === "number"
        ? data.price_overview.final / 100
        : null;
  } else if (data.is_free) {
    price = 0;
  }

  return {
    storeAppId: String(appid),
    title,
    developer: data.developers?.[0] ?? data.publishers?.[0] ?? "Unknown",
    category: data.genres?.[0]?.description ?? null,
    iconUrl: data.header_image ?? null,
    description: data.short_description ? decodeEntities(data.short_description) : null,
    websiteUrl: data.website ?? null,
    price,
    contentRating: requiredAge > 0 ? `${requiredAge}+` : null,
    screenshotUrls,
    releasedAt: parseSteamReleaseDate(data.release_date?.date),
    reviewCount: data.recommendations?.total ?? 0,
    rating: null,
  };
}
