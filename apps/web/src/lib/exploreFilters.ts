import type {
  AppSearchParams,
  AppSortField,
  GrowthPeriod,
  PriceType,
  SortOrder,
  Store,
  TextSearchField,
} from "@kittie/types";
import { formatCompact, formatMoney } from "./format";

export type SearchScope = "all" | TextSearchField;

export const SEARCH_SCOPE_LABELS: Record<SearchScope, string> = {
  all: "All",
  title: "Title",
  developer: "Developer",
  description: "Description",
};

const SEARCH_SCOPES: SearchScope[] = ["all", "title", "developer", "description"];

function parseScope(raw: string | null): SearchScope {
  const v = raw?.toLowerCase();
  return SEARCH_SCOPES.includes(v as SearchScope) ? (v as SearchScope) : "all";
}

/** UI-facing filter state for the Explore rail. Single source of truth = the URL. */
export interface ExploreFilters {
  q: string;
  scope: SearchScope;
  source?: Store;
  cats: string[];
  price: PriceType;
  rel?: number; // released within N days (after-bound / most recent)
  relBefore?: number; // released at least N days ago (before-bound / oldest) — Custom Range/Before
  upd?: number; // updated within N days
  updBefore?: number; // updated at least N days ago — Custom Range/Before
  ratingMin?: number;
  ratingMax?: number;
  reviewsMin?: number;
  reviewsMax?: number;
  dlMin?: number;
  dlMax?: number;
  revMin?: number;
  revMax?: number;
  meta: boolean; // hasMetaAds
  aads: boolean; // hasAppleAds
  creators: boolean; // hasCreators
  web: boolean; // hasWebsite
  email: boolean; // hasEmails
  period: GrowthPeriod; // growth window
  gtype: "all" | "positive" | "negative";
  sort: AppSortField;
  order: SortOrder;
}

export const EMPTY_FILTERS: ExploreFilters = {
  q: "",
  scope: "all",
  cats: [],
  price: "all",
  meta: false,
  aads: false,
  creators: false,
  web: false,
  email: false,
  period: "7d",
  gtype: "all",
  sort: "revenue",
  order: "desc",
};

export const TIME_WINDOWS = [7, 14, 30, 60, 90] as const;

/** Read filters out of the URL search params. */
export function parseFilters(sp: URLSearchParams): ExploreFilters {
  const num = (k: string) => {
    const v = sp.get(k);
    return v != null && v !== "" ? Number(v) : undefined;
  };

  // AppKittie / Rising handoff — `releasedAfter=custom&releasedAfterDate=YYYY-MM-DD`.
  // Only derive `rel` when the URL has no explicit `rel` param; otherwise preset pills,
  // the date dialog, and chip clears would be overridden by stale handoff keys.
  const relRaw = sp.get("rel");
  let rel = relRaw != null && relRaw !== "" ? Number(relRaw) : undefined;
  if (rel == null && sp.get("releasedAfter") === "custom") {
    const d = sp.get("releasedAfterDate");
    if (d) {
      const ms = Date.now() - new Date(`${d}T00:00:00`).getTime();
      if (ms > 0) rel = Math.max(1, Math.round(ms / 86_400_000));
    }
  }

  const excludedCats = sp.get("excludedCategories")?.split(",").filter(Boolean) ?? [];
  const includedCats = sp.get("cats")?.split(",").filter(Boolean) ?? [];

  return {
    q: sp.get("q") ?? "",
    scope: parseScope(sp.get("scope")),
    source: (sp.get("source") as Store) || undefined,
    cats: includedCats.length ? includedCats : excludedCats,
    price: (sp.get("price") as PriceType) || "all",
    rel,
    relBefore: num("relBefore"),
    upd: num("upd"),
    updBefore: num("updBefore"),
    ratingMin: num("ratingMin"),
    ratingMax: num("ratingMax"),
    reviewsMin: num("reviewsMin"),
    reviewsMax: num("reviewsMax"),
    dlMin: num("dlMin"),
    dlMax: num("dlMax"),
    revMin: num("revMin"),
    revMax: num("revMax"),
    meta: sp.get("meta") === "1",
    aads: sp.get("aads") === "1",
    creators: sp.get("creators") === "1",
    web: sp.get("web") === "1",
    email: sp.get("email") === "1",
    period:
      (sp.get("growthPeriod") as GrowthPeriod) || (sp.get("period") as GrowthPeriod) || "7d",
    gtype: (sp.get("gtype") as ExploreFilters["gtype"]) || "all",
    sort: (sp.get("sortBy") as AppSortField) || (sp.get("sort") as AppSortField) || "revenue",
    order: (sp.get("sortOrder") as SortOrder) || (sp.get("order") as SortOrder) || "desc",
  };
}

/** Serialize filters back to URL search params (omitting defaults for clean links). */
export function writeFilters(f: ExploreFilters): URLSearchParams {
  const sp = new URLSearchParams();
  const setN = (k: string, v?: number) => {
    if (v != null && !Number.isNaN(v)) sp.set(k, String(v));
  };
  const setB = (k: string, v: boolean) => {
    if (v) sp.set(k, "1");
  };
  if (f.q) sp.set("q", f.q);
  if (f.scope !== "all") sp.set("scope", f.scope);
  if (f.source) sp.set("source", f.source);
  if (f.cats.length) sp.set("cats", f.cats.join(","));
  if (f.price !== "all") sp.set("price", f.price);
  setN("rel", f.rel);
  setN("relBefore", f.relBefore);
  setN("upd", f.upd);
  setN("updBefore", f.updBefore);
  setN("ratingMin", f.ratingMin);
  setN("ratingMax", f.ratingMax);
  setN("reviewsMin", f.reviewsMin);
  setN("reviewsMax", f.reviewsMax);
  setN("dlMin", f.dlMin);
  setN("dlMax", f.dlMax);
  setN("revMin", f.revMin);
  setN("revMax", f.revMax);
  setB("meta", f.meta);
  setB("aads", f.aads);
  setB("creators", f.creators);
  setB("web", f.web);
  setB("email", f.email);
  if (f.period !== "7d") sp.set("growthPeriod", f.period);
  if (f.gtype !== "all") sp.set("gtype", f.gtype);
  if (f.sort !== "revenue") sp.set("sortBy", f.sort);
  if (f.order !== "desc") sp.set("sortOrder", f.order);
  return sp;
}

const daysAgoEpoch = (d?: number) =>
  d != null ? Math.floor((Date.now() - d * 86_400_000) / 1000) : undefined;

/** Map filter state to the REST `/apps` query params. */
export function toApiParams(f: ExploreFilters): AppSearchParams {
  return {
    search: f.q || undefined,
    textSearchFields: f.q && f.scope !== "all" ? f.scope : undefined,
    source: f.source,
    categories: f.cats.length ? f.cats.join(",") : undefined,
    priceType: f.price !== "all" ? f.price : undefined,
    releasedAfter: daysAgoEpoch(f.rel),
    releasedBefore: daysAgoEpoch(f.relBefore),
    updatedAfter: daysAgoEpoch(f.upd),
    updatedBefore: daysAgoEpoch(f.updBefore),
    minRating: f.ratingMin,
    maxRating: f.ratingMax,
    minReviews: f.reviewsMin,
    maxReviews: f.reviewsMax,
    minDownloads: f.dlMin,
    maxDownloads: f.dlMax,
    minRevenue: f.revMin,
    maxRevenue: f.revMax,
    hasMetaAds: f.meta || undefined,
    hasAppleAds: f.aads || undefined,
    hasCreators: f.creators || undefined,
    hasWebsite: f.web || undefined,
    hasEmails: f.email || undefined,
    growthPeriod: f.period,
    growthType: f.gtype !== "all" ? f.gtype : undefined,
    sortBy: f.sort,
    sortOrder: f.order,
  };
}

/** Count of active *filters* (search + sort are surfaced separately, so excluded). */
export function activeCount(f: ExploreFilters): number {
  let n = 0;
  if (f.source) n++;
  if (f.cats.length) n++;
  if (f.price !== "all") n++;
  if (f.rel != null || f.relBefore != null) n++;
  if (f.upd != null || f.updBefore != null) n++;
  if (f.ratingMin != null || f.ratingMax != null) n++;
  if (f.reviewsMin != null || f.reviewsMax != null) n++;
  if (f.dlMin != null || f.dlMax != null) n++;
  if (f.revMin != null || f.revMax != null) n++;
  if (f.meta) n++;
  if (f.aads) n++;
  if (f.creators) n++;
  if (f.web) n++;
  if (f.email) n++;
  if (f.gtype !== "all") n++;
  if (f.period !== "7d") n++;
  return n;
}

export interface Chip {
  id: string;
  label: string;
  clear: Partial<ExploreFilters>;
}

function rangeLabel(name: string, min: number | undefined, max: number | undefined, fmt: (n: number) => string): string {
  if (min != null && max != null) return `${name} ${fmt(min)}–${fmt(max)}`;
  if (min != null) return `${name} ≥ ${fmt(min)}`;
  return `${name} ≤ ${fmt(max!)}`;
}

const star = (n: number) => `${n}★`;

/** Time-window chip label. `within` = released within N days (recent bound),
 *  `atLeast` = older bound (≥ M days ago). Either or both may be set (Custom Range). */
function relWindowLabel(name: string, within?: number, atLeast?: number): string {
  if (within != null && atLeast != null) return `${name} ${within}–${atLeast}d ago`;
  if (atLeast != null) return `${name} ≥ ${atLeast}d ago`;
  return `${name} ≤ ${within}d`;
}

/** The removable chips shown above the table. */
export function activeChips(f: ExploreFilters): Chip[] {
  const c: Chip[] = [];
  if (f.source)
    c.push({ id: "source", label: f.source === "apple" ? "Apple Store" : "Google Play", clear: { source: undefined } });
  if (f.cats.length)
    c.push({ id: "cats", label: f.cats.length === 1 ? f.cats[0]! : `${f.cats.length} categories`, clear: { cats: [] } });
  if (f.price !== "all") c.push({ id: "price", label: f.price === "free" ? "Free" : "Paid", clear: { price: "all" } });
  if (f.rel != null || f.relBefore != null)
    c.push({ id: "rel", label: relWindowLabel("Released", f.rel, f.relBefore), clear: { rel: undefined, relBefore: undefined } });
  if (f.upd != null || f.updBefore != null)
    c.push({ id: "upd", label: relWindowLabel("Updated", f.upd, f.updBefore), clear: { upd: undefined, updBefore: undefined } });
  if (f.ratingMin != null || f.ratingMax != null)
    c.push({ id: "rating", label: rangeLabel("Rating", f.ratingMin, f.ratingMax, star), clear: { ratingMin: undefined, ratingMax: undefined } });
  if (f.reviewsMin != null || f.reviewsMax != null)
    c.push({ id: "reviews", label: rangeLabel("Reviews", f.reviewsMin, f.reviewsMax, formatCompact), clear: { reviewsMin: undefined, reviewsMax: undefined } });
  if (f.dlMin != null || f.dlMax != null)
    c.push({ id: "dl", label: rangeLabel("Downloads", f.dlMin, f.dlMax, formatCompact), clear: { dlMin: undefined, dlMax: undefined } });
  if (f.revMin != null || f.revMax != null)
    c.push({ id: "rev", label: rangeLabel("Revenue", f.revMin, f.revMax, formatMoney), clear: { revMin: undefined, revMax: undefined } });
  if (f.meta) c.push({ id: "meta", label: "Meta Ads", clear: { meta: false } });
  if (f.aads) c.push({ id: "aads", label: "Apple Ads", clear: { aads: false } });
  if (f.creators) c.push({ id: "creators", label: "Creators", clear: { creators: false } });
  if (f.web) c.push({ id: "web", label: "Has website", clear: { web: false } });
  if (f.email) c.push({ id: "email", label: "Has email", clear: { email: false } });
  if (f.gtype !== "all")
    c.push({ id: "gtype", label: f.gtype === "positive" ? "Growing" : "Declining", clear: { gtype: "all" } });
  if (f.period !== "7d")
    c.push({ id: "period", label: `Growth window: ${f.period}`, clear: { period: "7d", sort: "revenue" } });
  return c;
}
