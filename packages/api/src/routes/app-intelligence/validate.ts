import { Hono } from "hono";

/**
 * `validate_app_idea` — `POST /api/v1/app-intelligence/validate`.
 *
 * FOUNDATION stub: returns 501 until the synthesis logic lands in the
 * validate_app_idea PR (`packages/intelligence/src/idea-validation/`). Builds
 * LAST — it composes find_similar_apps for its competitor set.
 */
export const validateRouter = new Hono();

validateRouter.post("/", (c) =>
  c.json(
    { error: "not_implemented", tool: "validate_app_idea" },
    501,
  ),
);
