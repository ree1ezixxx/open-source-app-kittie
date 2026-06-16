// Lane B — ASO keyword API layer.
// Self-contained on purpose (merge hygiene): keyword types + fetchers live here,
// not in shared lib/api.ts. Rebase onto the live feat/keywords-aso API when it lands.
import type { Store } from "@kittie/types";

const BASE = "/api/v1";

export interface KeywordTopApp {
  title: string;
  iconUrl: string | null;
  reviewCount: number;
  rating: number | null;
  rank: number;
}

export interface KeywordDifficulty {
  keyword: string;
  country: string;
  store: Store;
  popularity: number; // 0–100, search volume proxy
  difficulty: number; // 0–100, how hard to rank
  trafficScore: number; // 0–100, traffic if you rank
  opportunityScore: number; // (pop×0.4)+((100−diff)×0.3) — computed client-side
  competingAppCount: number;
  topApps: KeywordTopApp[];
}

export interface KeywordSuggestion {
  keyword: string;
  source: string;
  appCount: number;
}

/** Locked grill spec v1 formula. Max ≈70 before app-specific relevance is layered in. */
export function computeOpportunity(popularity: number, difficulty: number): number {
  return Math.round(popularity * 0.4 + (100 - difficulty) * 0.3);
}

/** Normalize a raw difficulty payload — always recompute opportunity so we don't trust a stale server. */
function normalize(raw: Omit<KeywordDifficulty, "opportunityScore"> & { opportunityScore?: number }): KeywordDifficulty {
  const topApps = [...(raw.topApps ?? [])].sort((a, b) => a.rank - b.rank);
  return {
    ...raw,
    topApps,
    opportunityScore: computeOpportunity(raw.popularity, raw.difficulty),
  };
}

export async function lookupKeyword(
  keyword: string,
  store: Store,
  country = "US",
  signal?: AbortSignal,
  opts: { refresh?: boolean } = {},
): Promise<KeywordDifficulty> {
  const q = new URLSearchParams({ keyword, country, store });
  if (opts.refresh) q.set("refresh", "true");
  const res = await fetch(`${BASE}/keywords/difficulty?${q}`, { signal });
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
  const body = (await res.json()) as { data: KeywordDifficulty };
  return normalize(body.data);
}

// ── Tracked shortlist (durable, server-persisted — survives reload). ADR 0003 ──

export interface TrackedKeyword {
  id: string;
  keywordId: string; // stable deep-link identity (store:COUNTRY:keyword)
  keyword: string;
  country: string;
  store: Store;
  note: string | null;
  trackedAt: string;
  metrics: KeywordDifficulty | null;
}

export async function fetchTracked(signal?: AbortSignal): Promise<TrackedKeyword[]> {
  const res = await fetch(`${BASE}/keywords/tracked`, { signal });
  if (!res.ok) throw new Error(`Tracked fetch failed (${res.status})`);
  const body = (await res.json()) as { data: TrackedKeyword[] };
  return body.data.map((t) => ({ ...t, metrics: t.metrics ? normalize(t.metrics) : null }));
}

/** Score (if needed) + add a keyword to the shortlist. Returns the new entry. */
export async function trackKeyword(
  keyword: string,
  store: Store,
  country = "US",
): Promise<TrackedKeyword | null> {
  const res = await fetch(`${BASE}/keywords/tracked`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyword, country, store }),
  });
  if (!res.ok) throw new Error(`Track failed (${res.status})`);
  const body = (await res.json()) as { data: TrackedKeyword | null };
  if (!body.data) return null;
  return { ...body.data, metrics: body.data.metrics ? normalize(body.data.metrics) : null };
}

export async function untrackKeyword(keyword: string, store: Store, country = "US"): Promise<void> {
  const q = new URLSearchParams({ keyword, country, store });
  const res = await fetch(`${BASE}/keywords/tracked?${q}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Untrack failed (${res.status})`);
}

// ── Tracked apps (durable, server-persisted — survives reload). PRD #20 ──────
// Persist-only at this slice (#22): adding an app records it server-side; no
// keyword generation or rank ingestion yet (slices #23/#24).

export interface TrackedApp {
  id: string;
  appId: string;
  store: Store;
  country: string;
  title: string;
  developer: string;
  iconUrl: string | null;
  category: string | null;
  addedAt: string;
  /** AI-generated keyword count — zero until slice #23. */
  generatedKeywordCount: number;
  /** When rank analysis last ran — null until slice #24. */
  lastAnalyzedAt: string | null;
}

export async function fetchTrackedApps(signal?: AbortSignal): Promise<TrackedApp[]> {
  const res = await fetch(`${BASE}/keywords/tracked-apps`, { signal });
  if (!res.ok) throw new Error(`Tracked apps fetch failed (${res.status})`);
  const body = (await res.json()) as { data: TrackedApp[] };
  return body.data;
}

/** Persist an app to the tracked list. Idempotent server-side. Returns the entry. */
export async function trackApp(appId: string, country = "US"): Promise<TrackedApp | null> {
  const res = await fetch(`${BASE}/keywords/tracked-apps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appId, country }),
  });
  if (!res.ok) throw new Error(`Track app failed (${res.status})`);
  const body = (await res.json()) as { data: TrackedApp | null };
  return body.data;
}

export async function untrackApp(appId: string, store: Store, country = "US"): Promise<void> {
  const q = new URLSearchParams({ appId, store, country });
  const res = await fetch(`${BASE}/keywords/tracked-apps?${q}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Untrack app failed (${res.status})`);
}

/** Batch compare ≤10 keywords — sorted by opportunity score descending (we sort, not the server). */
export async function compareKeywords(
  terms: { keyword: string; store: Store }[],
  country = "US",
  signal?: AbortSignal,
): Promise<KeywordDifficulty[]> {
  const keywords = terms.slice(0, 10).map((t) => ({ keyword: t.keyword, country, store: t.store }));
  const res = await fetch(`${BASE}/keywords/difficulty`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keywords }),
    signal,
  });
  if (!res.ok) throw new Error(`Compare failed (${res.status})`);
  const body = (await res.json()) as { data: KeywordDifficulty[] };
  return body.data.map(normalize).sort((a, b) => b.opportunityScore - a.opportunityScore);
}

/** Related keyword ideas for a seed (store autocomplete + competitor titles; unscored). */
export async function fetchRelated(
  keyword: string,
  store: Store,
  country = "US",
  signal?: AbortSignal,
): Promise<string[]> {
  const q = new URLSearchParams({ keyword, country, store });
  const res = await fetch(`${BASE}/keywords/related?${q}`, { signal });
  if (!res.ok) throw new Error(`Related lookup failed (${res.status})`);
  const body = (await res.json()) as { data: string[] };
  return body.data;
}

export interface KeywordMarket {
  country: string;
  popularity: number;
  difficulty: number;
  competingAppCount: number;
  opportunityScore: number;
}

/**
 * Streaming cross-market analysis: each market's score arrives the moment the
 * server computes it (SSE), so the UI fills live instead of blocking on all
 * 26. Returns a cancel function.
 */
export function streamKeywordMarkets(
  keyword: string,
  store: Store,
  countries: string[],
  handlers: {
    onMarket: (m: KeywordMarket & { done: number; total: number }) => void;
    onDone?: () => void;
    onError?: () => void;
  },
): () => void {
  const q = new URLSearchParams({ keyword, store, countries: countries.join(",") });
  const es = new EventSource(`${BASE}/keywords/markets/stream?${q}`);
  es.addEventListener("market", (e) => {
    handlers.onMarket(JSON.parse((e as MessageEvent).data) as KeywordMarket & { done: number; total: number });
  });
  es.addEventListener("done", () => {
    handlers.onDone?.();
    es.close();
  });
  es.onerror = () => {
    handlers.onError?.();
    es.close();
  };
  return () => es.close();
}

/** The same keyword scored across markets — the cross-market opportunity finder. */
export async function fetchKeywordMarkets(
  keyword: string,
  store: Store,
  countries?: string[],
  signal?: AbortSignal,
): Promise<KeywordMarket[]> {
  const q = new URLSearchParams({ keyword, store });
  if (countries?.length) q.set("countries", countries.join(","));
  const res = await fetch(`${BASE}/keywords/markets?${q}`, { signal });
  if (!res.ok) throw new Error(`Markets lookup failed (${res.status})`);
  const body = (await res.json()) as { data: KeywordMarket[] };
  return body.data;
}

// ── Suggestion chips ─────────────────────────────────────────────
// Primary: GET /keywords/suggestions. Falls back to deriving from the live apps
// database, then to a static ASO seed — so the empty state is never barren.

const STOPWORDS = new Set([
  "the", "and", "for", "with", "app", "apps", "your", "free", "pro", "plus",
  "lite", "ios", "android", "best", "new", "get", "all", "now",
]);

const STATIC_SEED = [
  "habit tracker", "meditation", "budget planner", "sleep sounds",
  "language learning", "workout", "ai chat", "photo editor",
];

export async function fetchSuggestions(
  store: Store,
  limit = 12,
  signal?: AbortSignal,
): Promise<string[]> {
  // 1. Live suggestions endpoint (present on feat/keywords-aso).
  try {
    const q = new URLSearchParams({ store, limit: String(limit) });
    const res = await fetch(`${BASE}/keywords/suggestions?${q}`, { signal });
    if (res.ok) {
      const body = (await res.json()) as { data: KeywordSuggestion[] };
      const out = body.data.map((s) => s.keyword).filter(Boolean);
      if (out.length) return out.slice(0, limit);
    }
  } catch {
    /* fall through */
  }
  // 2. Derive from tracked-app titles + categories.
  try {
    const derived = await deriveSuggestionsFromApps(store, limit, signal);
    if (derived.length) return derived;
  } catch {
    /* fall through */
  }
  // 3. Static seed.
  return STATIC_SEED.slice(0, limit);
}

interface RawAppLite {
  title: string;
  category: string | null;
}

/** Replicates the server's category + title-bigram seeding from the live /apps data. */
export async function deriveSuggestionsFromApps(
  store: Store,
  limit: number,
  signal?: AbortSignal,
): Promise<string[]> {
  const res = await fetch(`${BASE}/apps?source=${store}&limit=100`, { signal });
  if (!res.ok) return [];
  const body = (await res.json()) as { data: RawAppLite[] };
  return keywordSeedsFromApps(body.data, limit);
}

export function keywordSeedsFromApps(
  apps: { title: string; category?: string | null }[],
  limit: number,
): string[] {
  const counts = new Map<string, number>();
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);

  for (const app of apps) {
    if (app.category) {
      const cat = app.category.toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
      if (cat) bump(cat);
    }
    const tokens = (app.title ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
    for (let i = 0; i < tokens.length - 1; i++) bump(`${tokens[i]} ${tokens[i + 1]}`);
  }

  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .slice(0, limit);
}

// ── Keyword insights (locked spec decision #9, standard set) ──────

export interface KeywordInsight {
  label: string;
  value: string;
  hint: string;
  tone: "good" | "warn" | "neutral";
}

function keywordTokens(keyword: string): string[] {
  return keyword.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

export function computeInsights(kd: KeywordDifficulty): KeywordInsight[] {
  const apps = kd.topApps;
  if (apps.length === 0) return [];

  const top = apps[0]!;
  const tokens = keywordTokens(kd.keyword);
  const inTitle = tokens.some((t) => top.title.toLowerCase().includes(t));

  const top5 = apps.slice(0, 5);
  const avgReviews = Math.round(top5.reduce((s, a) => s + a.reviewCount, 0) / top5.length);

  const top10 = apps.slice(0, 10);
  const weakest = top10.reduce((min, a) => (a.reviewCount < min.reviewCount ? a : min), top10[0]!);

  const last = top10[top10.length - 1]!;
  const gap = top.reviewCount - last.reviewCount;

  return [
    {
      label: "Term in #1 title",
      value: inTitle ? "Yes" : "No",
      hint: inTitle
        ? "The #1 app targets this term directly — expect a tougher climb."
        : "The #1 app doesn't use this term in its title — a relevance opening.",
      tone: inTitle ? "warn" : "good",
    },
    {
      label: "Avg reviews · top 5",
      value: compact(avgReviews),
      hint: "Mean review count across the top 5 — your social-proof bar.",
      tone: avgReviews < 1000 ? "good" : avgReviews < 25000 ? "neutral" : "warn",
    },
    {
      label: "Weakest top-10 link",
      value: `#${weakest.rank} · ${compact(weakest.reviewCount)}`,
      hint: `${weakest.title} ranks with the fewest reviews — the easiest slot to displace.`,
      tone: "neutral",
    },
    {
      label: "#1 vs #10 gap",
      value: compact(gap),
      hint: gap > 100000
        ? "Huge review chasm between top and bottom — entrenched leader."
        : "Tight review spread — ranks are contestable.",
      tone: gap > 100000 ? "warn" : "good",
    },
  ];
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return String(Math.round(n));
}
