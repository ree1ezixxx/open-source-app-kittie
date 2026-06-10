import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import type { Db } from "../client.js";
import {
  alertRules,
  alerts,
  appChanges,
  apps,
  jobCursors,
  trackedApps,
} from "../schema.js";

/* ============================================================
   Monitor layer — Tracked apps, App changes, Alerts, job cursors.
   Additive lane only (see docs/PRD-additive-edge.md). The sibling of
   queries/tracked-keywords.ts: a Tracked app is the durable server-side
   anchor that change history attaches to.
   ============================================================ */

/* ----------------------------------------------------- Tracked apps */

export interface TrackedAppEntry {
  /** tracked_apps row id */
  id: string;
  appId: string;
  note: string | null;
  trackedAt: Date;
  lastCapturedAt: Date | null;
  app: {
    title: string;
    developer: string;
    iconUrl: string | null;
    category: string | null;
    price: number | null;
    store: string;
    storeAppId: string;
  };
}

/** Add an App to the tracked shortlist. Idempotent. */
export async function trackApp(db: Db, appId: string, note?: string | null): Promise<void> {
  await db
    .insert(trackedApps)
    .values({ id: randomUUID(), appId, note: note ?? null, trackedAt: new Date() })
    .onConflictDoNothing({ target: trackedApps.appId });
}

/** Remove an App from the shortlist. Its change history stays (append-only). */
export async function untrackApp(db: Db, appId: string): Promise<void> {
  await db.delete(trackedApps).where(eq(trackedApps.appId, appId));
}

export async function isAppTracked(db: Db, appId: string): Promise<boolean> {
  const rows = await db
    .select({ id: trackedApps.id })
    .from(trackedApps)
    .where(eq(trackedApps.appId, appId))
    .limit(1);
  return rows.length > 0;
}

/** The full tracked shortlist with listing context, newest first. */
export async function listTrackedAppEntries(db: Db): Promise<TrackedAppEntry[]> {
  const rows = await db
    .select({ t: trackedApps, a: apps })
    .from(trackedApps)
    .innerJoin(apps, eq(trackedApps.appId, apps.id))
    .orderBy(desc(trackedApps.trackedAt));

  return rows.map(({ t, a }) => ({
    id: t.id,
    appId: t.appId,
    note: t.note,
    trackedAt: t.trackedAt,
    lastCapturedAt: t.lastCapturedAt,
    app: {
      title: a.title,
      developer: a.developer,
      iconUrl: a.iconUrl,
      category: a.category,
      price: a.price,
      store: a.store,
      storeAppId: a.storeAppId,
    },
  }));
}

export async function updateTrackedNote(db: Db, appId: string, note: string | null): Promise<void> {
  await db.update(trackedApps).set({ note }).where(eq(trackedApps.appId, appId));
}

/* ------------------------------------------------ Capture baseline */

/** The watched-field map at the last capture — the diff baseline. */
export async function getCaptureBaseline(
  db: Db,
  appId: string,
): Promise<{ fields: Record<string, unknown>; capturedAt: Date } | null> {
  const rows = await db
    .select({ lastCapture: trackedApps.lastCapture, lastCapturedAt: trackedApps.lastCapturedAt })
    .from(trackedApps)
    .where(eq(trackedApps.appId, appId))
    .limit(1);
  const row = rows[0];
  if (!row?.lastCapture || !row.lastCapturedAt) return null;
  try {
    return { fields: JSON.parse(row.lastCapture) as Record<string, unknown>, capturedAt: row.lastCapturedAt };
  } catch {
    return null;
  }
}

export async function saveCaptureBaseline(
  db: Db,
  appId: string,
  fields: Record<string, unknown>,
  capturedAt: Date,
): Promise<void> {
  await db
    .update(trackedApps)
    .set({ lastCapture: JSON.stringify(fields), lastCapturedAt: capturedAt })
    .where(eq(trackedApps.appId, appId));
}

/* -------------------------------------------------------- Changes */

export interface AppChangeInput {
  appId: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  priorAt: Date;
  capturedAt: Date;
}

/** Append recorded changes. Returns the inserted row ids in input order. */
export async function insertAppChanges(db: Db, changes: AppChangeInput[]): Promise<string[]> {
  if (changes.length === 0) return [];
  const rows = changes.map((c) => ({ id: randomUUID(), ...c }));
  await db.insert(appChanges).values(rows);
  return rows.map((r) => r.id);
}

export interface AppChangeEntry {
  id: string;
  appId: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  priorAt: Date;
  capturedAt: Date;
}

/** One Tracked app's change timeline, newest first. */
export async function listAppChanges(db: Db, appId: string, limit = 200): Promise<AppChangeEntry[]> {
  return db
    .select()
    .from(appChanges)
    .where(eq(appChanges.appId, appId))
    .orderBy(desc(appChanges.capturedAt), desc(appChanges.id))
    .limit(limit);
}

export interface RecentChangeEntry extends AppChangeEntry {
  appTitle: string;
  appIconUrl: string | null;
}

/** Cross-app recent changes (the Monitor overview), newest first. */
export async function listRecentChanges(db: Db, limit = 100): Promise<RecentChangeEntry[]> {
  const rows = await db
    .select({ c: appChanges, title: apps.title, iconUrl: apps.iconUrl })
    .from(appChanges)
    .innerJoin(apps, eq(appChanges.appId, apps.id))
    .orderBy(desc(appChanges.capturedAt), desc(appChanges.id))
    .limit(limit);
  return rows.map(({ c, title, iconUrl }) => ({ ...c, appTitle: title, appIconUrl: iconUrl }));
}

/* ---------------------------------------------------------- Rules */

export interface AlertRuleEntry {
  id: string;
  rule: string;
  threshold: number | null;
  enabled: boolean;
  channels: string[];
}

/** Insert any missing default rules (idempotent boot step). */
export async function ensureDefaultAlertRules(
  db: Db,
  defaults: Array<{ rule: string; threshold: number | null }>,
): Promise<void> {
  const existing = await db.select({ rule: alertRules.rule }).from(alertRules);
  const have = new Set<string>(existing.map((r) => r.rule));
  const missing = defaults.filter((d) => !have.has(d.rule));
  if (missing.length === 0) return;
  type RuleName = (typeof alertRules.$inferInsert)["rule"];
  await db.insert(alertRules).values(
    missing.map((d) => ({
      id: randomUUID(),
      rule: d.rule as RuleName,
      threshold: d.threshold,
      enabled: true,
      channels: '["feed"]',
    })),
  );
}

export async function listAlertRules(db: Db): Promise<AlertRuleEntry[]> {
  const rows = await db.select().from(alertRules);
  return rows.map((r) => ({
    id: r.id,
    rule: r.rule,
    threshold: r.threshold,
    enabled: r.enabled,
    channels: safeParseArray(r.channels),
  }));
}

export async function updateAlertRule(
  db: Db,
  id: string,
  patch: { threshold?: number | null; enabled?: boolean; channels?: string[] },
): Promise<void> {
  const set: Record<string, unknown> = {};
  if ("threshold" in patch) set.threshold = patch.threshold;
  if ("enabled" in patch) set.enabled = patch.enabled;
  if (patch.channels) set.channels = JSON.stringify(patch.channels);
  if (Object.keys(set).length === 0) return;
  await db.update(alertRules).set(set).where(eq(alertRules.id, id));
}

function safeParseArray(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/* --------------------------------------------------------- Alerts */

export interface AlertInput {
  appId: string;
  appChangeId: string;
  ruleId: string;
  createdAt: Date;
}

export async function insertAlerts(db: Db, inputs: AlertInput[]): Promise<string[]> {
  if (inputs.length === 0) return [];
  const rows = inputs.map((a) => ({ id: randomUUID(), ...a, readAt: null }));
  await db.insert(alerts).values(rows);
  return rows.map((r) => r.id);
}

export interface AlertFeedEntry {
  id: string;
  appId: string;
  appTitle: string;
  appIconUrl: string | null;
  rule: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: Date;
  capturedAt: Date;
  readAt: Date | null;
}

/** The Alert feed, newest first. */
export async function listAlertsFeed(
  db: Db,
  opts: { unreadOnly?: boolean; limit?: number } = {},
): Promise<AlertFeedEntry[]> {
  const limit = opts.limit ?? 100;
  const where = opts.unreadOnly ? isNull(alerts.readAt) : undefined;
  const rows = await db
    .select({
      al: alerts,
      rule: alertRules.rule,
      change: appChanges,
      title: apps.title,
      iconUrl: apps.iconUrl,
    })
    .from(alerts)
    .innerJoin(alertRules, eq(alerts.ruleId, alertRules.id))
    .innerJoin(appChanges, eq(alerts.appChangeId, appChanges.id))
    .innerJoin(apps, eq(alerts.appId, apps.id))
    .where(where)
    .orderBy(desc(alerts.createdAt), desc(alerts.id))
    .limit(limit);

  return rows.map(({ al, rule, change, title, iconUrl }) => ({
    id: al.id,
    appId: al.appId,
    appTitle: title,
    appIconUrl: iconUrl,
    rule,
    field: change.field,
    oldValue: change.oldValue,
    newValue: change.newValue,
    createdAt: al.createdAt,
    capturedAt: change.capturedAt,
    readAt: al.readAt,
  }));
}

/** Mark specific alerts (or all unread) as read. */
export async function markAlertsRead(db: Db, ids?: string[]): Promise<void> {
  const now = new Date();
  if (ids && ids.length > 0) {
    await db.update(alerts).set({ readAt: now }).where(inArray(alerts.id, ids));
  } else {
    await db.update(alerts).set({ readAt: now }).where(isNull(alerts.readAt));
  }
}

export async function countUnreadAlerts(db: Db): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(alerts)
    .where(isNull(alerts.readAt));
  return rows[0]?.n ?? 0;
}

/** Recent alerts for one App — feeds the evaluator's cooldown gate. */
export async function listRecentAlertsForApp(
  db: Db,
  appId: string,
  sinceHours: number,
): Promise<Array<{ rule: string; createdAt: Date }>> {
  const since = new Date(Date.now() - sinceHours * 3600_000);
  const rows = await db
    .select({ rule: alertRules.rule, createdAt: alerts.createdAt })
    .from(alerts)
    .innerJoin(alertRules, eq(alerts.ruleId, alertRules.id))
    .where(and(eq(alerts.appId, appId), gte(alerts.createdAt, since)));
  return rows;
}

/* ---------------------------------------------------- Job cursors */

export async function getJobCursor(db: Db, id: string): Promise<string | null> {
  const rows = await db
    .select({ state: jobCursors.state })
    .from(jobCursors)
    .where(eq(jobCursors.id, id))
    .limit(1);
  return rows[0]?.state ?? null;
}

export async function saveJobCursor(db: Db, id: string, state: string): Promise<void> {
  const now = new Date();
  await db
    .insert(jobCursors)
    .values({ id, state, updatedAt: now })
    .onConflictDoUpdate({ target: jobCursors.id, set: { state, updatedAt: now } });
}
