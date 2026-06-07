import { Hono } from "hono";
import { parseAppSearchParams } from "../lib/params.js";
import { getAppById, getAppHistoricals, searchApps } from "../services/app-service.js";

export const appsRouter = new Hono();

appsRouter.get("/", (c) => {
  const params = parseAppSearchParams(c.req.query());
  const result = searchApps(params);
  return c.json(result);
});

appsRouter.get("/:id", (c) => {
  const app = getAppById(c.req.param("id"));
  if (!app) return c.json({ error: "App not found" }, 404);
  return c.json({ data: app });
});

appsRouter.get("/:id/historicals", (c) => {
  const historicals = getAppHistoricals(c.req.param("id"));
  if (!historicals) return c.json({ error: "App not found" }, 404);
  return c.json({ data: historicals });
});
