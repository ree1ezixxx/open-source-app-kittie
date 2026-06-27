import { Hono } from "hono";
import { getSnapshotContext } from "@kittie/db";
import { signalsFromContext, buildAuditReport } from "@kittie/intelligence";
import { getDb } from "../lib/db.js";

// GET /api/v1/audit?app=<id> — the audit engine's first surface (epic #168).
// Returns a typed AuditReport: sub-scores + confidence + evidence for one app.
export const auditRouter = new Hono();

auditRouter.get("/", async (c) => {
  const appId = c.req.query("app");
  if (!appId) return c.json({ error: "Query param 'app' is required" }, 400);

  const ctx = await getSnapshotContext(getDb(), appId, "7d");
  if (!ctx) return c.json({ error: "App not found" }, 404);

  const signals = signalsFromContext(ctx);
  const report = buildAuditReport(
    {
      app: {
        id: ctx.app.id,
        name: ctx.app.title,
        category: ctx.app.category,
        iconUrl: ctx.app.iconUrl,
      },
      signals,
    },
    new Date().toISOString(),
  );

  return c.json({ data: report });
});
