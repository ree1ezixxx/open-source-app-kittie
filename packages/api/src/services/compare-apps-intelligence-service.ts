import { buildCompareAppsResponse, CompareAppsError } from "@kittie/intelligence";
import type {
  AppDetail,
  AppListItem,
  AppSearchParams,
  CompareAppRef,
  CompareAppsIntelligenceRequest,
  CompareAppsIntelligenceResponse,
  PaginatedResponse,
} from "@kittie/types";
import { getAppByAnyId, searchApps } from "./app-service.js";

export class CompareAppsIntelligenceError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "CompareAppsIntelligenceError";
  }
}

interface CompareAppsIntelligenceDeps {
  getAppByAnyId(id: string): Promise<AppDetail | null>;
  searchApps(params: AppSearchParams): Promise<PaginatedResponse<AppListItem>>;
  now(): Date;
}

const defaultDeps: CompareAppsIntelligenceDeps = {
  getAppByAnyId,
  searchApps,
  now: () => new Date(),
};

export async function getCompareAppsIntelligence(
  input: CompareAppsIntelligenceRequest,
  deps: CompareAppsIntelligenceDeps = defaultDeps,
): Promise<CompareAppsIntelligenceResponse> {
  if (!Array.isArray(input.apps) || input.apps.length < 2) {
    throw new CompareAppsIntelligenceError("Compare requires at least two Apps.", 400);
  }

  const apps = await Promise.all(input.apps.map((ref, index) => resolveApp(ref, index, deps)));
  try {
    return buildCompareAppsResponse({
      apps,
      generatedAt: deps.now().toISOString(),
      sourceQuery: sourceQueryFor(input),
    });
  } catch (err) {
    if (err instanceof CompareAppsError) {
      throw new CompareAppsIntelligenceError(err.message, 400);
    }
    throw err;
  }
}

async function resolveApp(
  input: CompareAppRef,
  index: number,
  deps: CompareAppsIntelligenceDeps,
): Promise<AppDetail> {
  const appId = input.appId?.trim();
  const query = input.query?.trim();
  if ((appId && query) || (!appId && !query)) {
    throw new CompareAppsIntelligenceError(`apps[${index}] must provide exactly one of appId or query.`, 400);
  }

  if (appId) {
    const app = await deps.getAppByAnyId(appId);
    if (!app) throw new CompareAppsIntelligenceError(`App not found for apps[${index}].appId: ${appId}`, 404);
    return app;
  }

  const result = await deps.searchApps({ search: query!, source: input.store, limit: 5 });
  if (result.pagination.totalCount === 0 || result.data.length === 0) {
    throw new CompareAppsIntelligenceError(`App not found for apps[${index}].query: ${query}`, 404);
  }
  if (result.pagination.totalCount > 1 || result.data.length > 1) {
    throw new CompareAppsIntelligenceError(`apps[${index}].query is ambiguous; provide a specific appId.`, 409, {
      candidates: result.data.slice(0, 5).map((app) => ({
        id: app.id,
        title: app.title,
        developer: app.developer,
        store: app.store,
        storeAppId: app.storeAppId,
      })),
    });
  }

  const app = await deps.getAppByAnyId(result.data[0]!.id);
  if (!app) {
    throw new CompareAppsIntelligenceError(`Resolved app detail is unavailable for apps[${index}].query: ${query}`, 404);
  }
  return app;
}

function sourceQueryFor(input: CompareAppsIntelligenceRequest): Record<string, string | number | boolean | null> {
  return {
    appCount: input.apps.length,
    apps: input.apps
      .map((app) => app.appId ?? (app.query ? `${app.store ?? "any"}:${app.query}` : "invalid"))
      .join(","),
  };
}
