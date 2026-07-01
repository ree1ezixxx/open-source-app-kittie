import { Hono } from "hono";
import type { AppDetailIntelligenceRequest } from "@kittie/types";
import {
  AppDetailIntelligenceError,
  getAppDetailIntelligence,
} from "../../services/app-detail-intelligence-service.js";

export const appDetailRouter = new Hono();

appDetailRouter.get("/apps/:id", async (c) => {
  try {
    const result = await getAppDetailIntelligence({ appId: c.req.param("id") });
    return c.json({ data: result });
  } catch (err) {
    if (err instanceof AppDetailIntelligenceError) {
      return c.json({ error: err.message, details: err.details ?? null }, err.status);
    }
    console.error("app_detail_intelligence failed:", err);
    return c.json({ error: "internal error" }, 500);
  }
});

appDetailRouter.post("/app-detail", async (c) => {
  let body: AppDetailIntelligenceRequest;
  try {
    body = (await c.req.json()) as AppDetailIntelligenceRequest;
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  try {
    const result = await getAppDetailIntelligence(body);
    return c.json({ data: result });
  } catch (err) {
    if (err instanceof AppDetailIntelligenceError) {
      return c.json({ error: err.message, details: err.details ?? null }, err.status);
    }
    console.error("app_detail_intelligence failed:", err);
    return c.json({ error: "internal error" }, 500);
  }
});
