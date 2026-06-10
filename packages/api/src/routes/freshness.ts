import { Hono } from "hono";

import { freshnessStatus } from "../services/freshness-service.js";

/**
 * Status surface for the freshness scheduler — powers the UI
 * "data as of <date>" footer and its sweep spinner.
 */
export const freshnessRouter = new Hono();

freshnessRouter.get("/", async (c) => {
  const status = await freshnessStatus();
  // "Data as of" = the most recent completed sweep across the registry.
  const lastRuns = status.sweeps
    .map((s) => s.lastRunAt)
    .filter((d): d is string => d !== null)
    .sort();
  return c.json({
    data: {
      ...status,
      dataAsOf: lastRuns.at(-1) ?? null,
    },
  });
});
