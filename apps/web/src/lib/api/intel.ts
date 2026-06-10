/* ============================================================
   Additive lane — Intelligence API client (isolated; do NOT fold
   into lib/api.ts).

   Three live surfaces over POST /api/v1/intel/*:
   • niche-mining     — clusters of pre-tagged review themes across a niche
   • keyword-gap      — subject vs competitors over the keyword inverse index
   • localization-gap — under-occupied keywords per market + app presence

   Shapes mirror packages/intelligence exactly (NicheReport, GapResult,
   MarketGapReport) — keep them in lockstep with the analyzers.
   ============================================================ */

const BASE = "/api/v1";

/** Mobile stores only — the intel index never carries steam/itch rows. */
export type IntelStore = "apple" | "google";

/* ----------------------------------------------------------------
   Niche mining — POST /intel/niche-mining
   ---------------------------------------------------------------- */
export type ClusterKind = "complaint" | "request" | "praise";

/** One mined theme across the niche, with evidence reviews to cite. */
export interface MinedCluster {
  kind: ClusterKind;
  label: string;
  count: number;
  appCount: number;
  /** 0..1 — share of the niche's mined reviews mentioning this theme. */
  share: number;
  avgRating: number;
  /** Recurrence-weighted score; comparable within one report only. */
  score: number;
  evidenceReviewIds: string[];
}

export interface NicheReport {
  totalReviews: number;
  appCount: number;
  /** The resolved niche — explicit ids, or every app in the category. */
  appIds: string[];
  clusters: MinedCluster[];
}

export interface NicheMiningParams {
  appIds?: string[];
  category?: string;
  limit?: number;
}

export async function mineNiche(
  params: NicheMiningParams,
  signal?: AbortSignal,
): Promise<NicheReport> {
  const res = await fetch(`${BASE}/intel/niche-mining`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
    signal,
  });
  if (!res.ok) throw new Error(`Niche mining failed (${res.status})`);
  const json = (await res.json()) as { data: NicheReport };
  return json.data;
}

/* ----------------------------------------------------------------
   Keyword gap — POST /intel/keyword-gap
   ---------------------------------------------------------------- */

/** A keyword in one market (country + store), scored from the subject's POV. */
export interface GapEntry {
  keywordId: string;
  keyword: string;
  country: string;
  store: IntelStore;
  subjectRank: number | null;
  /** Best rank ANY competitor holds — even beyond top 10 (nearest threat). */
  bestCompetitorRank: number | null;
  /** Distinct competitors actually inside the top 10. */
  competitorCount: number;
  /** 0–100 opportunity score (popularity vs difficulty). */
  opportunity: number;
}

export interface GapResult {
  /** Competitors rank top-10, subject absent or below — sorted by opportunity. */
  gaps: GapEntry[];
  /** Both sides inside the top 10 — contested ground. */
  shared: GapEntry[];
  /** Subject inside the top 10 with no competitor there — the moat. */
  subjectOnly: GapEntry[];
}

export interface KeywordGapParams {
  subjectAppId: string;
  /** 1–10 competitor app ids. */
  competitorAppIds: string[];
  /** 2-letter lowercase country code; omit for all markets. */
  country?: string;
  store?: IntelStore;
}

export async function fetchKeywordGap(
  params: KeywordGapParams,
  signal?: AbortSignal,
): Promise<GapResult> {
  const res = await fetch(`${BASE}/intel/keyword-gap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
    signal,
  });
  if (!res.ok) throw new Error(`Keyword gap analysis failed (${res.status})`);
  const json = (await res.json()) as { data: GapResult };
  return json.data;
}

/* ----------------------------------------------------------------
   Localization gap — POST /intel/localization-gap
   ---------------------------------------------------------------- */

/** A keyword in a market that is valuable yet under-occupied. */
export interface MarketOpening {
  keywordId: string;
  keyword: string;
  popularity: number | null;
  difficulty: number | null;
  /** Distinct apps inside the top 10 for this keyword in this market. */
  occupantCount: number;
  opportunity: number;
}

export interface MarketGapReport {
  country: string;
  /** How much of the index we observed in this market. */
  totalKeywords: number;
  openings: MarketOpening[];
}

/** Per-app keyword footprint by country — drives the presence matrix. */
export interface MarketPresence {
  appId: string;
  byCountry: Record<string, number>;
}

export interface LocalizationGapResult {
  markets: MarketGapReport[];
  /** Only populated when appIds were sent. */
  presence: MarketPresence[];
}

export interface LocalizationGapParams {
  appIds?: string[];
  store?: IntelStore;
}

export async function fetchLocalizationGap(
  params: LocalizationGapParams,
  signal?: AbortSignal,
): Promise<LocalizationGapResult> {
  const res = await fetch(`${BASE}/intel/localization-gap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
    signal,
  });
  if (!res.ok) throw new Error(`Localization gap analysis failed (${res.status})`);
  const json = (await res.json()) as { data: LocalizationGapResult };
  return json.data;
}
