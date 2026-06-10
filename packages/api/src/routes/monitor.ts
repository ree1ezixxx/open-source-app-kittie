import { Hono } from "hono";
import { z } from "zod";
import {
  countUnreadAlerts,
  getAppRowById,
  isAppTracked,
  listAlertRules,
  listAlertsFeed,
  listAppChanges,
  listRecentChanges,
  listTrackedAppEntries,
  markAlertsRead,
  trackApp,
  untrackApp,
  updateAlertRule,
  updateTrackedNote,
} from "@kittie/db";

import { getDb } from "../lib/db.js";
import { sweepTrackedApps } from "../services/capture-sweep-service.js";

/* ============================================================
   Monitor routes — Tracked apps, change timelines, the Alert feed.
   ============================================================ */

export const monitorRouter = new Hono();

/* ------------------------------------------------- tracked apps */

monitorRouter.get("/tracked-apps", async (c) => {
  const entries = await listTrackedAppEntries(getDb());
  return c.json({ data: entries });
});

const trackSchema = z.object({ appId: z.string().min(1), note: z.string().nullish() });

monitorRouter.post("/tracked-apps", async (c) => {
  const parsed = trackSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const db = getDb();
  const app = await getAppRowById(db, parsed.data.appId);
  if (!app) return c.json({ error: "Unknown app" }, 404);

  await trackApp(db, parsed.data.appId, parsed.data.note ?? null);
  return c.json({ data: { tracked: true, appId: parsed.data.appId } }, 201);
});

monitorRouter.delete("/tracked-apps/:appId", async (c) => {
  await untrackApp(getDb(), c.req.param("appId"));
  return c.json({ data: { tracked: false } });
});

const noteSchema = z.object({ note: z.string().nullable() });

monitorRouter.patch("/tracked-apps/:appId", async (c) => {
  const parsed = noteSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  await updateTrackedNote(getDb(), c.req.param("appId"), parsed.data.note);
  return c.json({ data: { ok: true } });
});

monitorRouter.get("/tracked-apps/:appId/status", async (c) => {
  const tracked = await isAppTracked(getDb(), c.req.param("appId"));
  return c.json({ data: { tracked } });
});

/* ----------------------------------------------------- changes */

monitorRouter.get("/tracked-apps/:appId/changes", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 200) || 200, 500);
  const changes = await listAppChanges(getDb(), c.req.param("appId"), limit);
  return c.json({ data: changes });
});

monitorRouter.get("/changes", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 100) || 100, 500);
  const changes = await listRecentChanges(getDb(), limit);
  return c.json({ data: changes });
});

/* ------------------------------------------------------ alerts */

monitorRouter.get("/alerts", async (c) => {
  const unreadOnly = c.req.query("unread") === "1";
  const limit = Math.min(Number(c.req.query("limit") ?? 100) || 100, 500);
  const feed = await listAlertsFeed(getDb(), { unreadOnly, limit });
  return c.json({ data: feed });
});

monitorRouter.get("/alerts/unread-count", async (c) => {
  const count = await countUnreadAlerts(getDb());
  return c.json({ data: { count } });
});

const readSchema = z.object({ ids: z.array(z.string()).optional() });

monitorRouter.post("/alerts/read", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = readSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  await markAlertsRead(getDb(), parsed.data.ids);
  return c.json({ data: { ok: true } });
});

monitorRouter.get("/alerts/rules", async (c) => {
  const rules = await listAlertRules(getDb());
  return c.json({ data: rules });
});

const ruleSchema = z.object({
  threshold: z.number().nullable().optional(),
  enabled: z.boolean().optional(),
  channels: z.array(z.enum(["feed", "banner"])).optional(),
});

monitorRouter.patch("/alerts/rules/:id", async (c) => {
  const parsed = ruleSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  await updateAlertRule(getDb(), c.req.param("id"), parsed.data);
  return c.json({ data: { ok: true } });
});

/* ------------------------------------------------------- sweep */

/** Manual capture pass (the boot/interval sweep also runs this). */
monitorRouter.post("/sweep", async (c) => {
  const result = await sweepTrackedApps({ staleHours: 0 });
  return c.json({ data: result });
});
