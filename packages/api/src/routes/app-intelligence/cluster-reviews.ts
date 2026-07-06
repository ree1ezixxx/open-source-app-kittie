import { Hono } from "hono";
import type { ClusterReviewsRequest } from "@kittie/types";
import { getReviewClusters, ReviewClustersError } from "../../services/review-clusters-service.js";
import { SimilarAppsError } from "../../services/similar-apps-service.js";

/**
 * cluster_reviews intelligence (#259) — `POST /api/v1/app-intelligence/cluster-reviews`.
 *
 * Body: `{ query?, appIds?, country?, limitApps?, maxReviewsPerApp?, since?,
 * themeTypes?, minThemeFrequency?, store? }` (query OR appIds required). Returns
 * the shared intelligence envelope (#180) over `ReviewClustersData`: ranked
 * cross-app complaint/praise/request themes with frequency, sentiment, spread,
 * evidence quotes, trend and confidence. Deterministic base always available;
 * themes are LLM-named when the Gemini seam is configured, else degrade honestly.
 */
export const clusterReviewsRouter = new Hono();

clusterReviewsRouter.post("/", async (c) => {
  let body: ClusterReviewsRequest;
  try {
    body = (await c.req.json()) as ClusterReviewsRequest;
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  try {
    const result = await getReviewClusters(body);
    return c.json({ data: result });
  } catch (err) {
    if (err instanceof ReviewClustersError || err instanceof SimilarAppsError) {
      return c.json({ error: err.message }, err.status);
    }
    console.error("cluster_reviews intelligence failed:", err);
    return c.json({ error: "internal error" }, 500);
  }
});
