import { Hono } from "hono";
import { getAuditReport } from "../services/audit-service.js";

export const auditRouter = new Hono();

auditRouter.get("/", async (c) => {
  const appId = c.req.query("app");
  if (!appId) return c.json({ error: "Missing app query parameter" }, 400);

  const report = await getAuditReport(appId);
  if (!report) return c.json({ error: "Audit report unavailable" }, 404);

  return c.json({ data: report });
});
