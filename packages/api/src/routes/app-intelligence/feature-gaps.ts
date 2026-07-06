import { Hono } from "hono";
import type { FindFeatureGapsRequest } from "@kittie/types";
import { getFeatureGaps, FeatureGapsError } from "../../services/feature-gaps-service.js";
import { SimilarAppsError } from "../../services/similar-apps-service.js";

/**
 * find_feature_gaps intelligence (#260) — `POST /api/v1/app-intelligence/feature-gaps`.
 *
 * Body: `{ query?, appIds?, country?, limitApps?, includeReviewSignals?,
 * includeDescriptionSignals?, minDemand?, store? }` (query OR appIds required).
 * Returns the shared intelligence envelope (#180) over `FeatureGapsData`: a
 * feature × competitor matrix separating table-stakes from whitespace gaps, with
 * coverage from listings and demand/quality from the #259 cluster_reviews service.
 */
export const featureGapsRouter = new Hono();

featureGapsRouter.post("/", async (c) => {
  let body: FindFeatureGapsRequest;
  try {
    body = (await c.req.json()) as FindFeatureGapsRequest;
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  try {
    const result = await getFeatureGaps(body);
    return c.json({ data: result });
  } catch (err) {
    if (err instanceof FeatureGapsError || err instanceof SimilarAppsError) {
      return c.json({ error: err.message }, err.status);
    }
    console.error("feature_gaps intelligence failed:", err);
    return c.json({ error: "internal error" }, 500);
  }
});
