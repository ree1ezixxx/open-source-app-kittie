import { Hono } from "hono";
import type { FindSimilarAppsInput } from "@kittie/types";
import { buildIntelligenceResponse } from "@kittie/intelligence";
import { findSimilarApps, SimilarAppsError } from "../../services/similar-apps-service.js";
import {
  missingToSources,
  similarToEvidence,
  toIntelligenceConfidence,
} from "../../services/intelligence-envelope.js";

/**
 * `find_similar_apps` — `POST /api/v1/app-intelligence/similar`.
 *
 * Body: `{ query?: string, appId?: string, store?: "apple"|"google", limit?: number }`
 * (exactly one of `query` / `appId`). Returns ranked competitors with a
 * deterministic similarity score + class (direct/adjacent/analogue) + reasons +
 * full market signals + confidence, plus an `agentSummary`.
 *
 * Response is the canonical #180 `IntelligenceResponseEnvelope`, wrapped as
 * `{ data: envelope }` (see docs/contracts/intelligence-responses.md). The full
 * ranked result set (with its own `confidence`/`missing`) is `envelope.data`;
 * the envelope surfaces the shared confidence/evidence/caveats/status fields —
 * each ranked competitor becomes one evidence entry.
 */
export const similarRouter = new Hono();

similarRouter.post("/", async (c) => {
  let body: FindSimilarAppsInput;
  try {
    body = (await c.req.json()) as FindSimilarAppsInput;
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  try {
    const result = await findSimilarApps(body);
    const envelope = buildIntelligenceResponse({
      responseType: "similar",
      data: result,
      evidence: similarToEvidence(result.similar),
      confidence: toIntelligenceConfidence(result.confidence),
      missingSources: missingToSources(result.missing),
      metadata: {
        generatedAt: new Date().toISOString(),
        sourceQuery: {
          query: body.query ?? null,
          appId: body.appId ?? null,
          store: body.store ?? null,
          limit: body.limit ?? null,
        },
        snapshotId: null,
        chartCountry: null,
        growthPeriod: null,
        modelVersion: null,
      },
    });
    return c.json({ data: envelope });
  } catch (err) {
    if (err instanceof SimilarAppsError) {
      return c.json({ error: err.message }, err.status);
    }
    console.error("find_similar_apps failed:", err);
    return c.json({ error: "internal error" }, 500);
  }
});
