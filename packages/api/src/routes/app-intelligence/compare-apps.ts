import { Hono } from "hono";
import type { CompareAppsIntelligenceRequest } from "@kittie/types";
import {
  CompareAppsIntelligenceError,
  getCompareAppsIntelligence,
} from "../../services/compare-apps-intelligence-service.js";

export const compareAppsRouter = new Hono();

compareAppsRouter.post("/", async (c) => {
  let body: CompareAppsIntelligenceRequest;
  try {
    body = (await c.req.json()) as CompareAppsIntelligenceRequest;
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  try {
    const result = await getCompareAppsIntelligence(body);
    return c.json({ data: result });
  } catch (err) {
    if (err instanceof CompareAppsIntelligenceError) {
      return c.json({ error: err.message, details: err.details ?? null }, err.status);
    }
    console.error("compare_apps_intelligence failed:", err);
    return c.json({ error: "internal error" }, 500);
  }
});
