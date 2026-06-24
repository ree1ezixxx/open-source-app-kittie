import { Hono } from "hono";
import type { ValidateAppIdeaInput } from "@kittie/types";
import { validateAppIdea, ValidateIdeaError } from "../../services/validate-idea-service.js";
import { SimilarAppsError } from "../../services/similar-apps-service.js";

/**
 * `validate_app_idea` — `POST /api/v1/app-intelligence/validate`.
 *
 * Body: `{ idea: string, store?: "apple"|"google" }`. Returns a
 * DecisionPacket-anchored report — interpreted idea, competitor summary,
 * deterministic score breakdown, controlled verdict, LLM angle/MVP/risks
 * (cached, degrades on quota), confidence + evidence (in `packet`), and an
 * `agentSummary`.
 */
export const validateRouter = new Hono();

validateRouter.post("/", async (c) => {
  let body: ValidateAppIdeaInput;
  try {
    body = (await c.req.json()) as ValidateAppIdeaInput;
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  try {
    const result = await validateAppIdea(body);
    return c.json(result);
  } catch (err) {
    if (err instanceof ValidateIdeaError || err instanceof SimilarAppsError) {
      return c.json({ error: err.message }, err.status);
    }
    console.error("validate_app_idea failed:", err);
    return c.json({ error: "internal error" }, 500);
  }
});
