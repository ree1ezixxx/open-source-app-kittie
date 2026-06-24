import { Hono } from "hono";
import type { FindSimilarAppsInput } from "@kittie/types";
import { findSimilarApps, SimilarAppsError } from "../../services/similar-apps-service.js";

/**
 * `find_similar_apps` — `POST /api/v1/app-intelligence/similar`.
 *
 * Body: `{ query?: string, appId?: string, store?: "apple"|"google", limit?: number }`
 * (exactly one of `query` / `appId`). Returns ranked competitors with a
 * deterministic similarity score + class (direct/adjacent/analogue) + reasons +
 * full market signals + confidence, plus an `agentSummary`.
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
    return c.json(result);
  } catch (err) {
    if (err instanceof SimilarAppsError) {
      return c.json({ error: err.message }, err.status);
    }
    console.error("find_similar_apps failed:", err);
    return c.json({ error: "internal error" }, 500);
  }
});
