import { Hono } from "hono";

import { buildRoadmapTemplate } from "../roadmap/template.js";

/**
 * Roadmap — the per-venture founder-journey canvas. Slice 1 serves the fixed
 * curated template (no persistence, no derived state yet); later slices add
 * ventures, You-node state, and the live Build window.
 */
export const roadmapRouter = new Hono();

roadmapRouter.get("/template", (c) => {
  return c.json({ data: buildRoadmapTemplate() });
});
