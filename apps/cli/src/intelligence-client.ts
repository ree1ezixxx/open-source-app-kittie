/**
 * Thin client for the intelligence API paths the CLI commands wrap (#186).
 * Resolves the base URL through the shared config (single source of truth with
 * `doctor`/`config`), and maps transport/HTTP failures to a clear `ApiError`.
 */
import type {
  AppDetailIntelligenceResponse,
  ClusterReviewsRequest,
  CompareAppRef,
  CompareAppsIntelligenceResponse,
  FeatureGapsIntelligenceResponse,
  FindFeatureGapsRequest,
  IntelligenceResponseEnvelope,
  RankWhitespaceIdeasRequest,
  ReviewClustersIntelligenceResponse,
  TrendsResponseData,
  ValidateIdeaIntelligenceRequest,
  ValidateIdeaIntelligenceResponse,
  WhitespaceIdeasIntelligenceResponse,
} from "@kittie/types";
import { loadConfig } from "./config.js";

export type TrendsIntelligenceResponse = IntelligenceResponseEnvelope<TrendsResponseData, "trends">;

export class ApiError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function baseUrl(): string {
  return loadConfig().apiBaseUrl.replace(/\/+$/, "");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = baseUrl();
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, init);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new ApiError(
      `Cannot reach the API at ${base} — is it running? Set the origin with \`pluto config set api-url <url>\`. (${reason})`,
      null,
    );
  }
  const raw = await res.text();
  let body: unknown = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return body as T;
}

/** app-detail + compare wrap their envelope in `{ data }`; unwrap one level. */
function unwrapData<T>(body: { data: T }): T {
  return body.data;
}

export function getAppIntelligence(id: string): Promise<AppDetailIntelligenceResponse> {
  return request<{ data: AppDetailIntelligenceResponse }>(
    `/api/v1/app-intelligence/apps/${encodeURIComponent(id)}`,
  ).then(unwrapData);
}

export interface TrendingParams {
  category?: string;
  country?: string;
  period?: string;
  limit?: number;
}

export function getTrending(params: TrendingParams = {}): Promise<TrendsIntelligenceResponse> {
  const qs = new URLSearchParams();
  if (params.category) qs.set("category", params.category);
  if (params.country) qs.set("country", params.country);
  if (params.period) qs.set("growthPeriod", params.period);
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  const query = qs.toString();
  // trends returns the envelope top-level (no `{ data }` wrapper).
  return request(`/api/v1/app-intelligence/trends${query ? `?${query}` : ""}`);
}

export function compareApps(apps: CompareAppRef[]): Promise<CompareAppsIntelligenceResponse> {
  return request<{ data: CompareAppsIntelligenceResponse }>(`/api/v1/app-intelligence/compare-apps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apps }),
  }).then(unwrapData);
}

export function validateIdea(
  input: ValidateIdeaIntelligenceRequest,
): Promise<ValidateIdeaIntelligenceResponse> {
  // Canonical idea-validation path (#184): #180 envelope wrapped in `{ data }`.
  return request<{ data: ValidateIdeaIntelligenceResponse }>(
    `/api/v1/app-intelligence/validate-idea`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  ).then(unwrapData);
}

export function clusterReviews(
  input: ClusterReviewsRequest,
): Promise<ReviewClustersIntelligenceResponse> {
  // #259 cross-app review clustering: #180 envelope wrapped in `{ data }`.
  return request<{ data: ReviewClustersIntelligenceResponse }>(
    `/api/v1/app-intelligence/cluster-reviews`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  ).then(unwrapData);
}

export function findFeatureGaps(
  input: FindFeatureGapsRequest,
): Promise<FeatureGapsIntelligenceResponse> {
  // #260 feature × competitor matrix: #180 envelope wrapped in `{ data }`.
  return request<{ data: FeatureGapsIntelligenceResponse }>(
    `/api/v1/app-intelligence/feature-gaps`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  ).then(unwrapData);
}

export function rankWhitespaceIdeas(
  input: RankWhitespaceIdeasRequest,
): Promise<WhitespaceIdeasIntelligenceResponse> {
  // #261 opportunity ranking: #180 envelope wrapped in `{ data }`.
  return request<{ data: WhitespaceIdeasIntelligenceResponse }>(
    `/api/v1/app-intelligence/whitespace-ideas`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  ).then(unwrapData);
}
