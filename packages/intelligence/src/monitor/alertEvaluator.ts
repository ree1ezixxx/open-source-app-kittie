/**
 * Alert evaluator for the Monitor layer.
 *
 * Turns recorded App changes into Alert candidates behind the PRD D4
 * trust gate: an Alert never fires on a single gappy capture (the diff
 * would straddle missing days), an impossible delta, or a sub-threshold
 * move. Pure function of recorded changes + rules — persistence and
 * delivery live elsewhere.
 */

import type { FieldChange } from "./capture.js";

/** Rule families an Alert can fire under. */
export type AlertRuleType =
  | "rank_shift"
  | "price_change"
  | "metadata_change"
  | "rating_drop"
  | "revenue_swing"
  | "new_ad_creative";

/** A user-editable `alert_rules` row. A null threshold falls back to the rule's default. */
export interface RuleConfig {
  id: string;
  rule: AlertRuleType;
  threshold: number | null;
  enabled: boolean;
}

/**
 * D4 default thresholds: rank ±10, rating −0.2 stars, revenue ±25%;
 * price and metadata fire on any recorded change. `new_ad_creative` is
 * designed but cannot fire — meta_ads ingestion is dormant.
 */
export const DEFAULT_RULES: Array<{ rule: AlertRuleType; threshold: number | null }> = [
  { rule: "rank_shift", threshold: 10 },
  { rule: "rating_drop", threshold: 0.2 },
  { rule: "revenue_swing", threshold: 25 },
  { rule: "price_change", threshold: null },
  { rule: "metadata_change", threshold: null },
  { rule: "new_ad_creative", threshold: null },
];

/** A previously fired Alert, consulted for cooldown dedup. */
export interface RecentAlert {
  rule: AlertRuleType;
  capturedAt: Date;
}

export interface EvaluateOptions {
  /** Max hours between the paired captures for the diff to count as clean (default 48). */
  gapToleranceHours?: number;
  /** Hours an Alert of the same rule suppresses repeats; exactly elapsed = clear (default 24). */
  cooldownHours?: number;
  recentAlerts?: RecentAlert[];
}

/** An App change that cleared the trust gate, ready to persist as an Alert. */
export interface AlertCandidate {
  ruleId: string;
  rule: AlertRuleType;
  change: FieldChange;
  summary: string;
}

const HOUR_MS = 3_600_000;

/** Float noise must not gate a move sitting exactly on its threshold. */
const THRESHOLD_EPSILON = 1e-9;

/**
 * Listing fields covered by `metadata_change`. review_count is absent on
 * purpose — velocity alerts are not v1 — and downloads_estimate has no
 * rule family at all.
 */
const METADATA_FIELDS: ReadonlySet<FieldChange["field"]> = new Set([
  "title",
  "description",
  "screenshot_urls",
  "category",
  "content_rating",
]);

function asNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function defaultThreshold(rule: AlertRuleType): number | null {
  return DEFAULT_RULES.find((entry) => entry.rule === rule)?.threshold ?? null;
}

/**
 * Sized-move check per rule family. One-sided nulls suppress the sized
 * rules — entering/leaving a chart, gaining a first rating, or a first
 * revenue estimate is not a measurable shift in v1 — but price keeps
 * its null transitions: became-paid and became-free are real changes.
 */
function clearsRule(rule: AlertRuleType, change: FieldChange, threshold: number | null): boolean {
  switch (rule) {
    case "rank_shift": {
      if (change.field !== "chart_rank" || threshold === null) return false;
      const oldRank = asNumber(change.oldValue);
      const newRank = asNumber(change.newValue);
      if (oldRank === null || newRank === null) return false;
      return Math.abs(newRank - oldRank) + THRESHOLD_EPSILON >= threshold;
    }
    case "rating_drop": {
      if (change.field !== "rating" || threshold === null) return false;
      const oldRating = asNumber(change.oldValue);
      const newRating = asNumber(change.newValue);
      if (oldRating === null || newRating === null) return false;
      return oldRating - newRating + THRESHOLD_EPSILON >= threshold;
    }
    case "revenue_swing": {
      if (change.field !== "revenue_estimate" || threshold === null) return false;
      const oldRevenue = asNumber(change.oldValue);
      const newRevenue = asNumber(change.newValue);
      if (oldRevenue === null || newRevenue === null || oldRevenue <= 0) return false;
      const pct = Math.abs(((newRevenue - oldRevenue) / oldRevenue) * 100);
      return pct + THRESHOLD_EPSILON >= threshold;
    }
    case "price_change":
      return change.field === "price";
    case "metadata_change":
      return METADATA_FIELDS.has(change.field);
    case "new_ad_creative":
      return false;
  }
}

/** Recorded prices render null as Free — the null↔value transitions are became-paid/became-free. */
function formatPrice(value: string | null): string {
  const price = asNumber(value);
  if (price === null) return value === null ? "Free" : String(value);
  return `$${price.toFixed(2)}`;
}

function formatUsd(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

function parseUrlSet(value: string | null): Set<string> {
  if (value === null) return new Set();
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function screenshotSummary(change: FieldChange): string {
  const oldUrls = parseUrlSet(change.oldValue);
  const newUrls = parseUrlSet(change.newValue);
  let added = 0;
  for (const url of newUrls) if (!oldUrls.has(url)) added += 1;
  let removed = 0;
  for (const url of oldUrls) if (!newUrls.has(url)) removed += 1;
  return `Screenshots updated (${added} added, ${removed} removed)`;
}

function metadataSummary(change: FieldChange): string {
  switch (change.field) {
    case "screenshot_urls":
      return screenshotSummary(change);
    case "title":
      return `Title "${change.oldValue ?? "—"}" → "${change.newValue ?? "—"}"`;
    case "description":
      return "Description updated";
    case "category":
      return `Category ${change.oldValue ?? "—"} → ${change.newValue ?? "—"}`;
    case "content_rating":
      return `Content rating ${change.oldValue ?? "—"} → ${change.newValue ?? "—"}`;
    default:
      return `${change.field} updated`;
  }
}

function buildSummary(rule: AlertRuleType, change: FieldChange): string {
  switch (rule) {
    case "rank_shift":
      return `Chart rank ${change.oldValue} → ${change.newValue}`;
    case "rating_drop":
      return `Rating ${change.oldValue} → ${change.newValue}`;
    case "revenue_swing": {
      const oldRevenue = asNumber(change.oldValue);
      const newRevenue = asNumber(change.newValue);
      if (oldRevenue === null || newRevenue === null || oldRevenue <= 0) {
        return `Revenue estimate ${change.oldValue} → ${change.newValue}`;
      }
      const pct = Math.round(((newRevenue - oldRevenue) / oldRevenue) * 100);
      return `Revenue estimate ${formatUsd(oldRevenue)} → ${formatUsd(newRevenue)} (${pct >= 0 ? "+" : ""}${pct}%)`;
    }
    case "price_change":
      return `Price ${formatPrice(change.oldValue)} → ${formatPrice(change.newValue)}`;
    case "metadata_change":
      return metadataSummary(change);
    case "new_ad_creative":
      return "New ad creative";
  }
}

function inCooldown(
  rule: AlertRuleType,
  capturedAt: Date,
  recentAlerts: RecentAlert[],
  cooldownHours: number,
): boolean {
  return recentAlerts.some(
    (alert) =>
      alert.rule === rule &&
      Math.abs(capturedAt.getTime() - alert.capturedAt.getTime()) / HOUR_MS < cooldownHours,
  );
}

/**
 * Evaluate recorded App changes against alert rules behind the D4 trust
 * gate, in order: disabled rules never fire; a gappy capture pair
 * (beyond gapToleranceHours, or time-reversed) is skipped; sized rules
 * need both sides non-null and the delta at threshold; price and
 * metadata fire on any recorded change; a same-rule Alert inside the
 * cooldown window suppresses the repeat; review_count never alerts.
 */
export function evaluateAlerts(
  changes: FieldChange[],
  rules: RuleConfig[],
  opts: EvaluateOptions = {},
): AlertCandidate[] {
  const gapToleranceHours = opts.gapToleranceHours ?? 48;
  const cooldownHours = opts.cooldownHours ?? 24;
  const recentAlerts = opts.recentAlerts ?? [];

  const candidates: AlertCandidate[] = [];
  for (const change of changes) {
    const pairGapHours = (change.capturedAt.getTime() - change.priorAt.getTime()) / HOUR_MS;
    if (pairGapHours < 0 || pairGapHours > gapToleranceHours) continue;

    for (const rule of rules) {
      if (!rule.enabled) continue;
      const threshold = rule.threshold ?? defaultThreshold(rule.rule);
      if (!clearsRule(rule.rule, change, threshold)) continue;
      if (inCooldown(rule.rule, change.capturedAt, recentAlerts, cooldownHours)) continue;
      candidates.push({
        ruleId: rule.id,
        rule: rule.rule,
        change,
        summary: buildSummary(rule.rule, change),
      });
    }
  }
  return candidates;
}
