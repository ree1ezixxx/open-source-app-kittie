import { Hono } from "hono";
import { getSnapshotContext, getRecentReviewsForApp } from "@kittie/db";
import { signalsFromContext, buildAuditReport, type PainReviewInput } from "@kittie/intelligence";
import { generateBuildBrief } from "@kittie/build-context";
import type { AuditReport } from "@kittie/types";
import { getDb } from "../lib/db.js";

// /api/v1/audit — the audit engine (epic #168).
//   GET /audit?app=<id>        → AuditReport (scores + confidence + evidence)
//   GET /audit/brief?app=<id>  → BuildBrief (agent-ready handoff, #175)
export const auditRouter = new Hono();

async function buildReportFor(appId: string): Promise<AuditReport | null> {
  const db = getDb();
  const ctx = await getSnapshotContext(db, appId, "7d");
  if (!ctx) return null;

  const signals = signalsFromContext(ctx);
  const reviewRows = await getRecentReviewsForApp(db, appId, 200);
  const reviews: PainReviewInput[] = reviewRows.map((r) => ({
    text: [r.title, r.body].filter(Boolean).join(". "),
    rating: r.rating,
    date: r.reviewedAt instanceof Date ? r.reviewedAt.toISOString() : null,
  }));

  return buildAuditReport(
    {
      app: {
        id: ctx.app.id,
        name: ctx.app.title,
        category: ctx.app.category,
        iconUrl: ctx.app.iconUrl,
        price: ctx.app.price,
      },
      signals,
      reviews,
    },
    new Date().toISOString(),
  );
}

auditRouter.get("/", async (c) => {
  const appId = c.req.query("app");
  if (!appId) return c.json({ error: "Query param 'app' is required" }, 400);
  const report = await buildReportFor(appId);
  if (!report) return c.json({ error: "App not found" }, 404);
  return c.json({ data: report });
});

auditRouter.get("/brief", async (c) => {
  const appId = c.req.query("app");
  if (!appId) return c.json({ error: "Query param 'app' is required" }, 400);
  const report = await buildReportFor(appId);
  if (!report) return c.json({ error: "App not found" }, 404);
  return c.json({ data: generateBuildBrief(report) });
});
