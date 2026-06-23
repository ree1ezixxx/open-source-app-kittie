/**
 * Market-lock evaluation. A lock is `stale` when the market data it pinned is
 * older than the freshness window, OR when the pinned source/model/tool
 * versions no longer match the current ones (the world moved under it). A
 * missing lock is reported distinctly so callers can decide; `isLockStale`
 * folds both "missing" and "stale" into a single "must re-verify" boolean.
 */
import { freshnessFrom } from "@kittie/core";
import type { LockState, MarketLock } from "./types.js";

export interface LockEvalOptions {
  /** Current time in epoch ms. */
  now: number;
  /** How old the pinned snapshot may be before it counts as stale. */
  maxAgeMs: number;
  currentDataSourceVersions?: Record<string, string>;
  currentScoringModelVersion?: string;
  currentToolVersions?: Record<string, string>;
}

function versionsDrifted(
  pinned: Record<string, string>,
  current: Record<string, string> | undefined,
): boolean {
  if (!current) return false;
  for (const [key, version] of Object.entries(current)) {
    if (pinned[key] !== version) return true;
  }
  return false;
}

export function evaluateLock(lock: MarketLock | null, opts: LockEvalOptions): LockState {
  if (!lock) return "missing";
  // Age is judged on the data's snapshot date, not when the lock was written.
  const freshness = freshnessFrom(`${lock.snapshotDate}T00:00:00.000Z`, opts.now, opts.maxAgeMs);
  if (freshness !== "fresh") return "stale";
  if (
    opts.currentScoringModelVersion !== undefined &&
    opts.currentScoringModelVersion !== lock.scoringModelVersion
  ) {
    return "stale";
  }
  if (versionsDrifted(lock.dataSourceVersions, opts.currentDataSourceVersions)) return "stale";
  if (versionsDrifted(lock.toolVersions, opts.currentToolVersions)) return "stale";
  return "fresh";
}

/** True when the lock must be re-verified — missing or stale. */
export function isLockStale(lock: MarketLock | null, opts: LockEvalOptions): boolean {
  return evaluateLock(lock, opts) !== "fresh";
}
