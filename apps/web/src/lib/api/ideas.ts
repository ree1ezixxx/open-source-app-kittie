/**
 * Hot app ideas — live API client for /api/v1/ideas.
 *
 * Ideas are AI-generated concepts derived from fast-growing Apps (ADR 0005),
 * batch-generated server-side and stored; this module only reads them. The
 * generation pipeline is the API's `hot-ideas` sweep.
 */

export type BlueprintTag = "backend" | "database" | "ai";

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

export interface IdeaBlueprint {
  difficulty: "easy" | "medium" | "hard";
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
  /** v2 (PRD #35): null on legacy ideas not yet upgraded by the backfill. */
  schemaVersion?: number;
  opportunity?: IdeaOpportunity | null;
  marketing?: IdeaMarketing | null;
}

export interface IdeaIap {
  name: string;
  price: number | null;
  currency: string | null;
}

export interface AppIdea {
  id: string;
  slug: string;
  /** Source App's store id — the stable token in the detail URL. */
  storeAppId: string | null;
  title: string;
  description: string;
  sourceCategory: string;
  ideaCategory: string;
  reviews: number;
  rating: number;
  downloads: number | null;
  revenue: number | null;
  price: number | null;
  releasedAt: string | null;
  createdAt: string; // ISO date
  blueprint: BlueprintTag[];
  blueprintDoc: IdeaBlueprint | null;
}

export type IdeaSort =
  | "created"
  | "released"
  | "reviews"
  | "downloads"
  | "revenue"
  | "rating"
  | "price";

export interface IdeasQuery {
  search?: string;
  sourceCategory?: string;
  ideaCategory?: string;
  blueprint?: BlueprintTag[];
  sort?: IdeaSort;
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface IdeasPage {
  ideas: AppIdea[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface IdeaDetail {
  idea: AppIdea;
  sourceApp: {
    id: string;
    store: string;
    storeAppId: string;
    title: string;
    developer: string | null;
    category: string | null;
    iconUrl: string | null;
    price: number | null;
    rating: number | null;
    reviews: number;
    downloads: number | null;
    revenue: number | null;
  };
  inAppPurchases: IdeaIap[];
  similar: AppIdea[];
}

const BASE = "/api/v1";

const BLUEPRINT_LABEL: Record<BlueprintTag, string> = {
  backend: "Needs backend",
  database: "Needs database",
  ai: "Needs AI",
};
export function blueprintLabel(tag: BlueprintTag): string {
  return BLUEPRINT_LABEL[tag];
}

interface WireIdea {
  id: string;
  slug: string;
  storeAppId: string | null;
  title: string;
  summary: string;
  sourceCategory: string;
  ideaCategory: string;
  needsBackend: boolean;
  needsDatabase: boolean;
  needsAi: boolean;
  blueprint: IdeaBlueprint | null;
  reviews: number;
  rating: number | null;
  downloads: number | null;
  revenue: number | null;
  price: number | null;
  releasedAt: string | null;
  createdAt: string;
}

function fromWire(w: WireIdea): AppIdea {
  const tags: BlueprintTag[] = [];
  if (w.needsBackend) tags.push("backend");
  if (w.needsDatabase) tags.push("database");
  if (w.needsAi) tags.push("ai");
  return {
    id: w.id,
    slug: w.slug,
    storeAppId: w.storeAppId,
    title: w.title,
    description: w.summary,
    sourceCategory: w.sourceCategory,
    ideaCategory: w.ideaCategory,
    reviews: w.reviews,
    rating: w.rating ?? 0,
    downloads: w.downloads,
    revenue: w.revenue,
    price: w.price,
    releasedAt: w.releasedAt,
    createdAt: w.createdAt,
    blueprint: tags,
    blueprintDoc: w.blueprint,
  };
}

/** The detail-page URL for an idea (live-parity format). */
export function ideaHref(idea: Pick<AppIdea, "slug" | "storeAppId">): string {
  return `/dashboard/hot-ideas/app-${idea.slug}-id${idea.storeAppId ?? ""}`;
}

export async function queryIdeas(q: IdeasQuery = {}, signal?: AbortSignal): Promise<IdeasPage> {
  const params = new URLSearchParams();
  if (q.search) params.set("search", q.search);
  if (q.sourceCategory) params.set("sourceCategory", q.sourceCategory);
  if (q.ideaCategory) params.set("ideaCategory", q.ideaCategory);
  if (q.blueprint?.length) params.set("blueprint", q.blueprint.join(","));
  if (q.sort) params.set("sort", q.sort);
  if (q.order) params.set("order", q.order);
  if (q.page) params.set("page", String(q.page));
  if (q.pageSize) params.set("pageSize", String(q.pageSize));

  const res = await fetch(`${BASE}/ideas?${params}`, { signal });
  if (!res.ok) throw new Error(`ideas request failed: ${res.status}`);
  const body = (await res.json()) as { data: Omit<IdeasPage, "ideas"> & { ideas: WireIdea[] } };
  return { ...body.data, ideas: body.data.ideas.map(fromWire) };
}

export async function fetchIdeaFacets(
  signal?: AbortSignal,
): Promise<{ sourceCategories: string[]; ideaCategories: string[] }> {
  const res = await fetch(`${BASE}/ideas/facets`, { signal });
  if (!res.ok) throw new Error(`idea facets failed: ${res.status}`);
  return ((await res.json()) as { data: { sourceCategories: string[]; ideaCategories: string[] } })
    .data;
}

export async function fetchIdeaDetail(
  storeAppId: string,
  signal?: AbortSignal,
): Promise<IdeaDetail | null> {
  const res = await fetch(`${BASE}/ideas/${encodeURIComponent(storeAppId)}`, { signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`idea detail failed: ${res.status}`);
  const body = (await res.json()) as {
    data: {
      idea: WireIdea;
      sourceApp: IdeaDetail["sourceApp"];
      inAppPurchases?: IdeaIap[];
      similar: WireIdea[];
    };
  };
  return {
    idea: fromWire(body.data.idea),
    sourceApp: body.data.sourceApp,
    inAppPurchases: body.data.inAppPurchases ?? [],
    similar: body.data.similar.map(fromWire),
  };
}
