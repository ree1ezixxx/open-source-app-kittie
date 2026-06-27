import { Hono } from "hono";
import { getSnapshotContext, getRecentReviewsForApp } from "@kittie/db";
import { signalsFromContext, buildAuditReport, type PainReviewInput } from "@kittie/intelligence";
import { getDb } from "../lib/db.js";

// GET /api/v1/audit?app=<id> — the audit engine's first surface (epic #168).
// Returns a typed AuditReport: sub-scores + confidence + evidence for one app.
export const auditRouter = new Hono();

auditRouter.get("/", async (c) => {
  const appId = c.req.query("app");
  if (!appId) return c.json({ error: "Query param 'app' is required" }, 400);

  const db = getDb();
  const ctx = await getSnapshotContext(db, appId, "7d");
  if (!ctx) return c.json({ error: "App not found" }, 404);

  const signals = signalsFromContext(ctx);
  const reviewRows = await getRecentReviewsForApp(db, appId, 200);
  const reviews: PainReviewInput[] = reviewRows.map((r) => ({
    text: [r.title, r.body].filter(Boolean).join(". "),
    rating: r.rating,
    date: r.reviewedAt instanceof Date ? r.reviewedAt.toISOString() : null,
  }));

  const report = buildAuditReport(
    {
      app: {
        id: ctx.app.id,
        name: ctx.app.title,
        category: ctx.app.category,
        iconUrl: ctx.app.iconUrl,
      },
      signals,
      reviews,
    },
    new Date().toISOString(),
  );

  return c.json({ data: report });
});
