import {
  ensureDefaultAlertRules,
  getCaptureBaseline,
  getLatestSnapshot,
  insertAlerts,
  insertAppChanges,
  listAlertRules,
  listRecentAlertsForApp,
  listTrackedAppEntries,
  saveCaptureBaseline,
} from "@kittie/db";
import { lookupAppleApp, fetchGoogleAppMetadata } from "@kittie/ingest";
import {
  captureChanges,
  DEFAULT_RULES,
  evaluateAlerts,
  type AlertRuleType,
  type Capture,
  type RuleConfig,
  type WatchedFields,
} from "@kittie/intelligence";

import { getDb } from "../lib/db.js";
import { bannersEnabled, sendBanner } from "./notifier.js";

/* ============================================================
   Capture sweep — the Monitor layer's heartbeat.

   For every Tracked app: fetch the live store listing (own fetch — never
   dependent on another lane's pipeline), diff against the stored baseline
   via the change-capture engine, append App changes, run the Alert
   evaluator behind its trust gate, insert qualifying Alerts, and update
   the baseline. Paced + per-app failure isolation, same shape as the
   review sweep. Runs only while the API process is up (documented).
   ============================================================ */

export interface CaptureSweepOptions {
  /** Skip apps captured within this window (hours). */
  staleHours?: number;
  /** Max tracked apps to capture in one sweep. */
  maxApps?: number;
  /** Gap between per-app captures (ms). */
  gapMs?: number;
}

export interface CaptureSweepResult {
  scanned: number;
  captured: number;
  changes: number;
  alerts: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Fetch the live watched-field map for one App from its own Store. */
async function fetchWatchedFields(
  store: string,
  storeAppId: string,
  appId: string,
): Promise<Partial<WatchedFields>> {
  const db = getDb();
  const fields: Partial<WatchedFields> = {};

  if (store === "apple") {
    const live = await lookupAppleApp(storeAppId);
    if (live) {
      fields.title = live.title;
      fields.description = live.description;
      fields.price = live.price;
      fields.category = live.category;
      fields.contentRating = live.contentRating;
      fields.screenshotUrls = live.screenshotUrls;
      fields.rating = live.rating;
      fields.reviewCount = live.reviewCount;
    }
  } else {
    const live = await fetchGoogleAppMetadata(storeAppId);
    fields.title = live.title;
    fields.description = live.description;
    fields.price = live.price;
    fields.category = live.category;
    fields.contentRating = live.contentRating;
    fields.screenshotUrls = live.screenshotUrls;
    fields.rating = live.rating;
    fields.reviewCount = live.reviewCount;
  }

  // Estimated/chart metrics ride on the latest Snapshot when one exists.
  // Left unobserved (absent) when the pipeline hasn't scored — the engine
  // skips absent fields rather than recording phantom null transitions.
  const snap = await getLatestSnapshot(db, appId);
  if (snap) {
    fields.chartRank = snap.chartRank;
    if (snap.revenueEstimate != null) fields.revenueEstimate = snap.revenueEstimate;
    if (snap.downloadsEstimate != null) fields.downloadsEstimate = snap.downloadsEstimate;
  }

  return fields;
}

/** One paced pass over stale Tracked apps. Safe to call repeatedly. */
export async function sweepTrackedApps(
  opts: CaptureSweepOptions = {},
): Promise<CaptureSweepResult> {
  const staleHours = opts.staleHours ?? 12;
  const maxApps = opts.maxApps ?? 50;
  const gapMs = opts.gapMs ?? 800;
  const db = getDb();

  await ensureDefaultAlertRules(db, DEFAULT_RULES);
  const ruleRows = await listAlertRules(db);
  const rules: RuleConfig[] = ruleRows.map((r) => ({
    id: r.id,
    rule: r.rule as AlertRuleType,
    threshold: r.threshold,
    enabled: r.enabled,
  }));
  const ruleIdByType = new Map(ruleRows.map((r) => [r.rule, r.id]));
  const bannerRules = new Set(
    ruleRows.filter((r) => r.channels.includes("banner")).map((r) => r.rule),
  );

  const tracked = await listTrackedAppEntries(db);
  const now = Date.now();
  const stale = tracked
    .filter((t) => !t.lastCapturedAt || now - t.lastCapturedAt.getTime() >= staleHours * 3600_000)
    .slice(0, maxApps);

  let captured = 0;
  let changeCount = 0;
  let alertCount = 0;

  for (const entry of stale) {
    try {
      const fields = await fetchWatchedFields(entry.app.store, entry.app.storeAppId, entry.appId);
      if (Object.keys(fields).length === 0) continue; // fetch failed — never capture emptiness

      const capturedAt = new Date();
      const baseline = await getCaptureBaseline(db, entry.appId);

      if (!baseline) {
        // First capture: establish the baseline; history starts accruing now.
        await saveCaptureBaseline(db, entry.appId, fields, capturedAt);
        captured++;
        continue;
      }

      const prior: Capture = {
        capturedAt: baseline.capturedAt,
        fields: baseline.fields as Partial<WatchedFields>,
      };
      const fresh: Capture = { capturedAt, fields };
      const changes = captureChanges(prior, fresh);

      if (changes.length > 0) {
        const changeIds = await insertAppChanges(
          db,
          changes.map((c) => ({
            appId: entry.appId,
            field: c.field,
            oldValue: c.oldValue,
            newValue: c.newValue,
            priorAt: c.priorAt,
            capturedAt: c.capturedAt,
          })),
        );
        changeCount += changes.length;

        const recent = await listRecentAlertsForApp(db, entry.appId, 24);
        const candidates = evaluateAlerts(changes, rules, {
          recentAlerts: recent.map((r) => ({
            rule: r.rule as AlertRuleType,
            capturedAt: r.createdAt,
          })),
        });

        if (candidates.length > 0) {
          await insertAlerts(
            db,
            candidates.map((cand) => ({
              appId: entry.appId,
              appChangeId: changeIds[changes.indexOf(cand.change)] ?? changeIds[0]!,
              ruleId: ruleIdByType.get(cand.rule) ?? cand.ruleId,
              createdAt: capturedAt,
            })),
          );
          alertCount += candidates.length;

          if (bannersEnabled()) {
            for (const cand of candidates) {
              if (!bannerRules.has(cand.rule)) continue;
              await sendBanner({
                appTitle: entry.app.title,
                rule: cand.rule,
                summary: cand.summary,
              });
            }
          }
        }
      }

      await saveCaptureBaseline(db, entry.appId, fields, capturedAt);
      captured++;
    } catch {
      /* one app failing must not abort the sweep */
    }
    await sleep(gapMs);
  }

  return { scanned: tracked.length, captured, changes: changeCount, alerts: alertCount };
}
