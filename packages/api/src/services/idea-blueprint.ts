/* ============================================================
   Hot-Ideas blueprint contract + parser (PRD #35).

   An idea's `blueprint` column is a JSON blob. v1 stored only the BUILDING plan
   (difficulty, features, architecture, …) at the top level. v2 flat-extends that
   same object with an `opportunity` analysis, a `marketing` plan, and a
   `schemaVersion` marker — so legacy rows stay readable (building fields in
   place, opportunity/marketing simply absent → null).

   This module is the single, pure, tested place that turns raw stored/LLM JSON
   into a typed, validated doc. No I/O — fixtures in, typed value out.
   ============================================================ */

export const BLUEPRINT_SCHEMA_VERSION = 2;

export interface IdeaBuilding {
  difficulty: string;
  difficultyReasoning: string;
  timelineWeeks: number;
  requirements: string[];
  mvpFeatures: string[];
  keyFeatures: string[];
  v2Features: string[];
  architecture: string;
  techStack: string[];
  mvpScope: string;
  thirdPartyServices: string[];
}

export interface IdeaOpportunity {
  summary: string;
  whyThisApp: string;
  marketSizeInsight: string;
  painPoints: string[];
  featureGaps: string[];
  targetAudience: string;
  monetizationStrategy: string;
  competitiveAdvantages: string[];
}

export interface IdeaMarketing {
  marketingStrategy: string;
  marketingPlatforms: string[];
  contentHooks: string[];
  ugcFormats: string[];
  campaignIdeas: string[];
  creatorTypes: string[];
  keySellingPoints: string[];
  asoKeywords: string[];
  goToMarket: string;
}

/** The normalized doc served to clients: building always present; opportunity /
 *  marketing null on legacy (v1) ideas not yet upgraded. */
export interface IdeaBlueprintDoc extends IdeaBuilding {
  schemaVersion: number;
  opportunity: IdeaOpportunity | null;
  marketing: IdeaMarketing | null;
}

// ---- primitive coercion (defensive: never throw on a bad field) ----

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** True when every listed key is a present, non-empty string OR a non-empty array. */
function hasAll(o: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((k) => {
    const v = o[k];
    // Arrays must hold ≥1 usable string — matches what strArr() keeps, so write-time
    // (pre-coercion) and read-time (post-coercion) validation agree. Otherwise an
    // all-non-string array passes here on write but fails on the next read, and the
    // idea is re-detected as stale and regenerated on every sweep forever.
    if (Array.isArray(v)) return v.some((x) => typeof x === "string" && x.trim().length > 0);
    return typeof v === "string" && v.trim().length > 0;
  });
}

/**
 * Validate an LLM-shaped opportunity object. Returns the typed value only when
 * every required field is present and well-formed; otherwise null (the idea
 * keeps its building plan but is treated as missing this section).
 */
export function parseOpportunity(raw: unknown): IdeaOpportunity | null {
  if (!isRecord(raw)) return null;
  if (
    !hasAll(raw, [
      "summary",
      "whyThisApp",
      "marketSizeInsight",
      "painPoints",
      "featureGaps",
      "targetAudience",
      "monetizationStrategy",
      "competitiveAdvantages",
    ])
  )
    return null;
  return {
    summary: str(raw.summary),
    whyThisApp: str(raw.whyThisApp),
    marketSizeInsight: str(raw.marketSizeInsight),
    painPoints: strArr(raw.painPoints),
    featureGaps: strArr(raw.featureGaps),
    targetAudience: str(raw.targetAudience),
    monetizationStrategy: str(raw.monetizationStrategy),
    competitiveAdvantages: strArr(raw.competitiveAdvantages),
  };
}

/** Validate an LLM-shaped marketing object (same contract as opportunity). */
export function parseMarketing(raw: unknown): IdeaMarketing | null {
  if (!isRecord(raw)) return null;
  if (
    !hasAll(raw, [
      "marketingStrategy",
      "marketingPlatforms",
      "contentHooks",
      "ugcFormats",
      "campaignIdeas",
      "creatorTypes",
      "keySellingPoints",
      "asoKeywords",
      "goToMarket",
    ])
  )
    return null;
  return {
    marketingStrategy: str(raw.marketingStrategy),
    marketingPlatforms: strArr(raw.marketingPlatforms),
    contentHooks: strArr(raw.contentHooks),
    ugcFormats: strArr(raw.ugcFormats),
    campaignIdeas: strArr(raw.campaignIdeas),
    creatorTypes: strArr(raw.creatorTypes),
    keySellingPoints: strArr(raw.keySellingPoints),
    asoKeywords: strArr(raw.asoKeywords),
    goToMarket: str(raw.goToMarket),
  };
}

/**
 * Normalize a stored/parsed blueprint blob (v1 flat building, or v2 with
 * opportunity + marketing) into the typed doc. Tolerates a JSON string, a
 * parsed object, or junk (junk → an empty building doc, never throws).
 */
export function normalizeBlueprint(raw: unknown): IdeaBlueprintDoc {
  let o: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed)) o = parsed;
    } catch {
      /* malformed JSON → empty doc */
    }
  } else if (isRecord(raw)) {
    o = raw;
  }
  return {
    schemaVersion: num(o.schemaVersion) || 1,
    difficulty: str(o.difficulty),
    difficultyReasoning: str(o.difficultyReasoning),
    timelineWeeks: num(o.timelineWeeks),
    requirements: strArr(o.requirements),
    mvpFeatures: strArr(o.mvpFeatures),
    keyFeatures: strArr(o.keyFeatures),
    v2Features: strArr(o.v2Features),
    architecture: str(o.architecture),
    techStack: strArr(o.techStack),
    mvpScope: str(o.mvpScope),
    thirdPartyServices: strArr(o.thirdPartyServices),
    opportunity: parseOpportunity(o.opportunity),
    marketing: parseMarketing(o.marketing),
  };
}

/** A blueprint is "fresh" once it carries the current schema AND both new
 *  sections — the catalog-upgrade sweep uses this to find legacy ideas. */
export function isBlueprintFresh(doc: IdeaBlueprintDoc): boolean {
  return (
    doc.schemaVersion >= BLUEPRINT_SCHEMA_VERSION &&
    doc.opportunity !== null &&
    doc.marketing !== null
  );
}
