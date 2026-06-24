import { Hono } from "hono";

/**
 * `find_similar_apps` — `POST /api/v1/app-intelligence/similar`.
 *
 * FOUNDATION stub: returns 501 until the retrieval logic lands in the
 * find_similar_apps PR (`packages/intelligence/src/similarity/`).
 */
export const similarRouter = new Hono();

similarRouter.post("/", (c) =>
  c.json(
    { error: "not_implemented", tool: "find_similar_apps" },
    501,
  ),
);
