import { Hono } from "hono";
import type { RankWhitespaceIdeasRequest } from "@kittie/types";
import { getWhitespaceIdeas, WhitespaceIdeasError } from "../../services/whitespace-service.js";
import { SimilarAppsError } from "../../services/similar-apps-service.js";

/**
 * rank_whitespace_ideas intelligence (#261) —
 * `POST /api/v1/app-intelligence/whitespace-ideas`.
 *
 * Body: `{ category, country?, limit?, seedIdeas?, minConfidence?, store? }`.
 * Returns the shared intelligence envelope (#180) over `WhitespaceIdeasData`:
 * ranked opportunity niches with score breakdowns, evidence, build angles and
 * honest funnel counts. Composes the #259 cluster_reviews and #260
 * find_feature_gaps services over a bounded candidate funnel.
 */
export const whitespaceIdeasRouter = new Hono();

whitespaceIdeasRouter.post("/", async (c) => {
  let body: RankWhitespaceIdeasRequest;
  try {
    body = (await c.req.json()) as RankWhitespaceIdeasRequest;
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  try {
    const result = await getWhitespaceIdeas(body);
    return c.json({ data: result });
  } catch (err) {
    if (err instanceof WhitespaceIdeasError || err instanceof SimilarAppsError) {
      return c.json({ error: err.message }, err.status);
    }
    console.error("whitespace_ideas intelligence failed:", err);
    return c.json({ error: "internal error" }, 500);
  }
});
