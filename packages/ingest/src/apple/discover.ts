import { sleep } from "../util/rate-limit.js";

/**
 * Broad Apple app-ID discovery for bulk seeding.
 * Two free sources, no auth:
 *  - Legacy genre RSS charts (popularity-ranked) — `itunes.apple.com/<cc>/rss/<feed>/limit/genre/json`
 *  - iTunes Search API (long-tail) — `itunes.apple.com/search?...&entity=software`
 * Returns unique storeAppIds with a chart-rank hint where one is known.
 */

export interface DiscoveredApp {
  storeAppId: string;
  chartRank: number | null;
  chartCategory: string | null;
  chartCountry: string | null;
}

// Top-level App Store genre IDs (https://...). Games (6014) is the largest.
export const GENRE_IDS = [
  6000, 6001, 6002, 6003, 6004, 6005, 6006, 6007, 6008, 6009, 6010, 6011,
  6012, 6013, 6014, 6015, 6016, 6017, 6018, 6020, 6021, 6023, 6024, 6027,
];

export const FEEDS = ["topfreeapplications", "toppaidapplications", "topgrossingapplications"];

export const COUNTRIES = [
  "us", "gb", "ca", "au", "de", "fr", "it", "es", "nl", "jp", "kr", "br", "mx", "in", "se",
];

// Seed terms for the long-tail search top-up (only used if charts don't reach target).
export const SEARCH_TERMS = [
  "fitness", "meditation", "budget", "photo editor", "vpn", "weather", "recipes",
  "language learning", "podcast", "music player", "running", "sleep", "habit tracker",
  "journal", "notes", "calendar", "scanner", "pdf", "invoice", "crypto", "stocks",
  "banking", "shopping", "fashion", "dating", "social", "video editor", "camera",
  "wallpaper", "puzzle game", "rpg", "racing", "sports", "news", "reading", "ebook",
  "comics", "kids", "education", "math", "coding", "ai chat", "translate", "travel",
  "maps", "flight", "hotel", "food delivery", "restaurant", "grocery", "coffee",
  "calorie counter", "workout", "yoga", "cycling", "golf", "soccer", "basketball",
  "poker", "casino", "trivia", "word game", "sudoku", "chess", "drawing", "logo maker",
  "resume", "email", "reminder", "password manager", "cloud storage", "wine", "parenting",
  "pregnancy", "astrology", "tarot", "mindfulness", "study", "flashcards", "white noise",
];

const THROTTLE_MS = 150;

interface RssEntry {
  id?: { attributes?: { "im:id"?: string } };
}
interface RssJson {
  feed?: { entry?: RssEntry | RssEntry[] };
}
interface SearchJson {
  results?: Array<{ trackId?: number }>;
}

/** One genre chart page → ordered storeAppIds. Tolerant of 404/empty country×genre combos. */
async function fetchGenreChart(country: string, genreId: number, feed: string, limit = 200): Promise<string[]> {
  const url = `https://itunes.apple.com/${country}/rss/${feed}/limit=${limit}/genre=${genreId}/json`;
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return [];
    const data = (await res.json()) as RssJson;
    const raw = data.feed?.entry;
    const entries: RssEntry[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return entries.map((e) => e.id?.attributes?.["im:id"]).filter((x): x is string => Boolean(x));
  } catch {
    return [];
  }
}

/** iTunes Search → storeAppIds (long-tail discovery). */
async function searchAppleApps(term: string, country: string, limit = 200): Promise<string[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${country}&entity=software&limit=${limit}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as SearchJson;
    return (data.results ?? []).map((r) => (r.trackId != null ? String(r.trackId) : "")).filter(Boolean);
  } catch {
    return [];
  }
}

export interface DiscoverOptions {
  target: number;
  countries?: string[];
  genres?: number[];
  feeds?: string[];
  terms?: string[];
  onProgress?: (uniqueCount: number) => void;
}

export async function discoverAppIds(opts: DiscoverOptions): Promise<DiscoveredApp[]> {
  const {
    target,
    countries = COUNTRIES,
    genres = GENRE_IDS,
    feeds = FEEDS,
    terms = SEARCH_TERMS,
    onProgress,
  } = opts;

  const found = new Map<string, DiscoveredApp>();

  // 1) Genre charts — popularity-ranked, the bulk of the set.
  for (const country of countries) {
    for (const genreId of genres) {
      for (const feed of feeds) {
        const ids = await fetchGenreChart(country, genreId, feed, 200);
        ids.forEach((id, i) => {
          if (!found.has(id)) {
            found.set(id, {
              storeAppId: id,
              chartRank: i + 1,
              chartCategory: feed,
              chartCountry: country.toUpperCase(),
            });
          }
        });
        onProgress?.(found.size);
        await sleep(THROTTLE_MS);
        if (found.size >= target) return [...found.values()].slice(0, target);
      }
    }
  }

  // 2) Search top-up — only if charts didn't reach the target.
  for (const country of countries) {
    for (const term of terms) {
      const ids = await searchAppleApps(term, country, 200);
      for (const id of ids) {
        if (!found.has(id)) {
          found.set(id, { storeAppId: id, chartRank: null, chartCategory: null, chartCountry: country.toUpperCase() });
        }
      }
      onProgress?.(found.size);
      await sleep(THROTTLE_MS);
      if (found.size >= target) return [...found.values()].slice(0, target);
    }
  }

  return [...found.values()].slice(0, target);
}
