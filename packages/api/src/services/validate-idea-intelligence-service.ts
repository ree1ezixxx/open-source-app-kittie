/**
 * validate-idea intelligence (#184) — orchestration. Composes find_similar_apps
 * (deterministic competitor retrieval) and review-theme mining with the pure
 * envelope builder in `@kittie/intelligence`. No LLM on this path: the verdict,
 * risks, opportunities, and confidence are all computed from observed/modelled
 * catalog signals, and thin evidence degrades honestly.
 */
import type {
  FindSimilarAppsInput,
  FindSimilarAppsResult,
  SimilarApp,
  ValidateIdeaIntelligenceRequest,
  ValidateIdeaIntelligenceResponse,
} from "@kittie/types";
import { getRecentReviewTagsForApps } from "@kittie/db";
import { buildValidateIdeaResponse, ValidateIdeaInputError } from "@kittie/intelligence";
import { getDb } from "../lib/db.js";
import { findSimilarApps } from "./similar-apps-service.js";

export class ValidateIdeaIntelligenceError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 = 400,
  ) {
    super(message);
    this.name = "ValidateIdeaIntelligenceError";
  }
}

interface ValidateIdeaIntelligenceDeps {
  findSimilarApps(input: FindSimilarAppsInput): Promise<FindSimilarAppsResult>;
  mineReviewThemes(competitors: SimilarApp[]): Promise<string[]>;
  now(): Date;
}

const defaultDeps: ValidateIdeaIntelligenceDeps = {
  findSimilarApps,
  mineReviewThemes,
  now: () => new Date(),
};

export async function getValidateIdeaIntelligence(
  input: ValidateIdeaIntelligenceRequest,
  deps: ValidateIdeaIntelligenceDeps = defaultDeps,
): Promise<ValidateIdeaIntelligenceResponse> {
  const idea = typeof input.idea === "string" ? input.idea.trim() : "";
  if (!idea) {
    throw new ValidateIdeaIntelligenceError("provide an `idea` (plain language) to validate");
  }
  if (input.store !== undefined && input.store !== "apple" && input.store !== "google") {
    throw new ValidateIdeaIntelligenceError('`store` must be "apple" or "google"');
  }

  const similar = await deps.findSimilarApps({
    query: idea,
    store: input.store,
    limit: input.limit,
  });
  const reviewThemes = await deps.mineReviewThemes(similar.similar);

  try {
    return buildValidateIdeaResponse({
      idea,
      interpreted: similar.interpretedQuery,
      // Pre-injection categories: the coherence gate must judge what the IDEA
      // resolved, not what `inferCategories` injected from incidental FTS hits (#246).
      statedCategories: similar.statedCategories ?? similar.interpretedQuery.categories,
      competitors: similar.similar,
      reviewThemes,
      missing: similar.missing,
      generatedAt: deps.now().toISOString(),
      sourceQuery: {
        idea,
        store: input.store ?? null,
        limit: input.limit ?? null,
      },
    });
  } catch (err) {
    if (err instanceof ValidateIdeaInputError) {
      throw new ValidateIdeaIntelligenceError(err.message, 400);
    }
    throw err;
  }
}

/**
 * Recurring competitor improvement-areas from recent classified reviews — the
 * observed "gaps" feeding the differentiation score. Empty when no review tags
 * exist locally; never fabricated.
 */
async function mineReviewThemes(competitors: SimilarApp[]): Promise<string[]> {
  const ids = competitors.slice(0, 20).map((c) => c.app.id);
  if (!ids.length) return [];
  const tags = await getRecentReviewTagsForApps(getDb(), ids, 50);
  const freq = new Map<string, number>();
  for (const t of tags.values()) {
    for (const area of t.improvementAreas) freq.set(area, (freq.get(area) ?? 0) + 1);
  }
  return [...freq.entries()]
    // Frequency desc, then theme name — a stable secondary key so equal-frequency
    // themes are deterministic regardless of DB row order (determinism guarantee).
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([k]) => k);
}
