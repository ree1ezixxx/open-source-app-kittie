import { Hono } from "hono";
import type { ValidateIdeaIntelligenceRequest } from "@kittie/types";
import {
  getValidateIdeaIntelligence,
  ValidateIdeaIntelligenceError,
} from "../../services/validate-idea-intelligence-service.js";
import { SimilarAppsError } from "../../services/similar-apps-service.js";

/**
 * validate-idea intelligence (#184) — `POST /api/v1/app-intelligence/validate-idea`.
 *
 * Body: `{ idea: string, store?: "apple"|"google", limit?: number }`. Returns
 * the shared intelligence response envelope (#180): verdict, risks,
 * opportunities, competitor evidence, likely category, confidence, and caveats
 * — deterministic and evidence-first, no LLM synthesis.
 */
export const validateIdeaRouter = new Hono();

validateIdeaRouter.post("/", async (c) => {
  let body: ValidateIdeaIntelligenceRequest;
  try {
    body = (await c.req.json()) as ValidateIdeaIntelligenceRequest;
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  try {
    const result = await getValidateIdeaIntelligence(body);
    return c.json({ data: result });
  } catch (err) {
    if (err instanceof ValidateIdeaIntelligenceError || err instanceof SimilarAppsError) {
      return c.json({ error: err.message }, err.status);
    }
    console.error("validate_idea_intelligence failed:", err);
    return c.json({ error: "internal error" }, 500);
  }
});
