import type {
  AppSearchParams,
  AppSortField,
  GrowthPeriod,
  PriceType,
  SortOrder,
  Store,
} from "@kittie/types";
import { formatCompact, formatMoney } from "./format";

/** UI-facing filter state for the Explore rail. Single source of truth = the URL. */
export interface ExploreFilters {
  q: string;
  source?: Store;
  cats: string[];
  price: PriceType;
  rel?: number; // released within N days
  upd?: number; // updated within N days
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
  return {
    q: sp.get("q") ?? "",
    source: (sp.get("source") as Store) || undefined,
    cats: sp.get("cats") ? sp.get("cats")!.split(",").filter(Boolean) : [],
    price: (sp.get("price") as PriceType) || "all",
    rel: num("rel"),
    upd: num("upd"),
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
    period: (sp.get("period") as GrowthPeriod) || "7d",
    gtype: (sp.get("gtype") as ExploreFilters["gtype"]) || "all",
    sort: (sp.get("sort") as AppSortField) || "revenue",
    order: (sp.get("order") as SortOrder) || "desc",
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
  if (f.source) sp.set("source", f.source);
  if (f.cats.length) sp.set("cats", f.cats.join(","));
  if (f.price !== "all") sp.set("price", f.price);
  setN("rel", f.rel);
  setN("upd", f.upd);
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
  if (f.period !== "7d") sp.set("period", f.period);
  if (f.gtype !== "all") sp.set("gtype", f.gtype);
  if (f.sort !== "revenue") sp.set("sort", f.sort);
  if (f.order !== "desc") sp.set("order", f.order);
  return sp;
}

const daysAgoEpoch = (d?: number) =>
  d != null ? Math.floor((Date.now() - d * 86_400_000) / 1000) : undefined;

/** Map filter state to the REST `/apps` query params. */
export function toApiParams(f: ExploreFilters): AppSearchParams {
  return {
    search: f.q || undefined,
    source: f.source,
    categories: f.cats.length ? f.cats.join(",") : undefined,
    priceType: f.price !== "all" ? f.price : undefined,
    releasedAfter: daysAgoEpoch(f.rel),
    updatedAfter: daysAgoEpoch(f.upd),
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
  if (f.rel != null) n++;
  if (f.upd != null) n++;
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

/** The removable chips shown above the table. */
export function activeChips(f: ExploreFilters): Chip[] {
  const c: Chip[] = [];
  if (f.source)
    c.push({ id: "source", label: f.source === "apple" ? "App Store" : "Google Play", clear: { source: undefined } });
  if (f.cats.length)
    c.push({ id: "cats", label: f.cats.length === 1 ? f.cats[0]! : `${f.cats.length} categories`, clear: { cats: [] } });
  if (f.price !== "all") c.push({ id: "price", label: f.price === "free" ? "Free" : "Paid", clear: { price: "all" } });
  if (f.rel != null) c.push({ id: "rel", label: `Released ≤ ${f.rel}d`, clear: { rel: undefined } });
  if (f.upd != null) c.push({ id: "upd", label: `Updated ≤ ${f.upd}d`, clear: { upd: undefined } });
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
  return c;
}
