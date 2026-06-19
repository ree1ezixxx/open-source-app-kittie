import { listSweepStates, recordSweepRun } from "@kittie/db";

import { getDb } from "../lib/db.js";

/* ============================================================
   Freshness scheduler (ADR 0004) — the ONE registry of paced sweeps.

   Every derived dataset (Reviews, Snapshots, Tracked keyword scores,
   Hot ideas, …) registers a sweep here instead of wiring its own
   setInterval. On boot, anything past its cadence runs (the Boot
   catch-up sweep); an interval re-checks while the API is up.

   Sweeps run SERIALIZED, in registration order — that is the global
   pacing budget: two sweeps never hammer the stores concurrently.
   Last-run times persist in sweep_state so catch-up survives restarts.
   ============================================================ */

export interface SweepDef {
  /** Stable identifier, also the sweep_state primary key. */
  name: string;
  /** How stale this dataset may get before the sweep is due. */
  cadenceHours: number;
  /** One pass. Returns a short human summary for the status surface. */
  run(): Promise<string | void>;
  /**
   * Owned by a separate process (ADR 0008): the API lists it in `/freshness`
   * (reading the `sweep_state` row that process writes) but never runs it
   * in-process. Keeps the heavy catalog snapshot out of the API event loop so an
   * OOM can't crash the serving layer or crash-loop boot catch-up.
   */
  external?: boolean;
}

export interface SweepStatus {
  name: string;
  cadenceHours: number;
  lastRunAt: string | null;
  lastSummary: string | null;
  running: boolean;
}

const registry: SweepDef[] = [];
let runningName: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

export function registerSweep(def: SweepDef): void {
  if (registry.some((s) => s.name === def.name)) {
    throw new Error(`sweep "${def.name}" is already registered`);
  }
  registry.push(def);
}

/**
 * Pure due-selection: which sweeps are past their cadence at `nowMs`, given
 * persisted last-run times (ms epoch; missing = never ran = due). Preserves
 * registration order so the serialized runner has a deterministic queue.
 */
export function selectDueSweeps(
  defs: readonly SweepDef[],
  lastRuns: ReadonlyMap<string, number>,
  nowMs: number,
): SweepDef[] {
  return defs.filter((def) => {
    if (def.external) return false; // owned by a separate process; the API never runs it
    const last = lastRuns.get(def.name);
    if (last === undefined) return true;
    return nowMs - last >= def.cadenceHours * 3_600_000;
  });
}

async function loadLastRuns(): Promise<Map<string, number>> {
  const rows = await listSweepStates(getDb());
  return new Map(rows.map((r) => [r.name, r.lastRunAt.getTime()]));
}

/** One scheduler pass: run every due sweep, one at a time. Safe to re-enter. */
let ticking = false;
export async function tick(): Promise<void> {
  if (ticking) return; // a long sweep may outlive the check interval
  ticking = true;
  try {
    const due = selectDueSweeps(registry, await loadLastRuns(), Date.now());
    for (const sweep of due) {
      runningName = sweep.name;
      const startedAt = Date.now();
      try {
        const summary = (await sweep.run()) ?? "ok";
        await recordSweepRun(getDb(), sweep.name, summary);
        console.log(`[freshness] ${sweep.name}: ${summary} (${Math.round((Date.now() - startedAt) / 1000)}s)`);
      } catch (e) {
        // A failed sweep stays stale and retries next tick; it must not
        // block the rest of the queue or crash the API.
        console.warn(`[freshness] ${sweep.name} failed:`, e instanceof Error ? e.message : e);
      } finally {
        runningName = null;
      }
    }
  } finally {
    ticking = false;
  }
}

export interface FreshnessOptions {
  /** Delay before the boot catch-up so server startup isn't competing with I/O. */
  bootDelayMs?: number;
  /** How often to re-check for due sweeps while the API is up. */
  checkIntervalMs?: number;
}

export function startFreshness(opts: FreshnessOptions = {}): void {
  const bootDelayMs = opts.bootDelayMs ?? 15_000;
  const checkIntervalMs = opts.checkIntervalMs ?? 15 * 60_000;
  setTimeout(() => void tick(), bootDelayMs);
  timer = setInterval(() => void tick(), checkIntervalMs);
}

export function stopFreshness(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Snapshot of every registered sweep for the UI footer / status endpoint. */
export async function freshnessStatus(): Promise<{ sweeps: SweepStatus[]; running: string | null }> {
  const lastRuns = await listSweepStates(getDb());
  const byName = new Map(lastRuns.map((r) => [r.name, r]));
  return {
    sweeps: registry.map((def) => {
      const state = byName.get(def.name);
      return {
        name: def.name,
        cadenceHours: def.cadenceHours,
        lastRunAt: state?.lastRunAt.toISOString() ?? null,
        lastSummary: state?.lastSummary ?? null,
        running: runningName === def.name,
      };
    }),
    running: runningName,
  };
}
