import { Hono } from "hono";
import { parseAppSearchParams } from "../lib/params.js";
import { getAppById, getAppHistoricals, searchApps } from "../services/app-service.js";

export const appsRouter = new Hono();

appsRouter.get("/", async (c) => {
  const params = parseAppSearchParams(c.req.query());
  const result = await searchApps(params);
  return c.json(result);
});

appsRouter.get("/:id", async (c) => {
  const app = await getAppById(c.req.param("id"));
  if (!app) return c.json({ error: "App not found" }, 404);
  return c.json({ data: app });
});

appsRouter.get("/:id/historicals", async (c) => {
  const historicals = await getAppHistoricals(c.req.param("id"));
  if (!historicals) return c.json({ error: "App not found" }, 404);
  return c.json({ data: historicals });
});
