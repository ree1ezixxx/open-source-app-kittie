import type { IdeaCandidate } from "@kittie/db";

/* ============================================================
   Hot Ideas selection gate (ADR 0005) — which Apps earn an idea.

   A blend of three signals, NOT pure Growth score, because Snapshot
   history is thin and growth alone is noisy:

   - rising:   Growth score + charting now (what momentum we can see)
   - recency:  recently released Apps are fresh-idea territory
   - lowFruit: high Revenue estimate + LOW rating = proven demand the
               incumbent is fumbling (the 1–2★ review thesis)

   The growth weight scales with how much Snapshot history exists, so
   the gate self-corrects as the daily sweep accrues days.
   ============================================================ */

export interface GateWeights {
  rising: number;
  recency: number;
  lowFruit: number;
}

/**
 * Growth data earns weight as history accrues: at ≤3 Snapshot days growth is
 * mostly noise, by ~21 days it can carry its full share.
 */
export function gateWeights(snapshotDays: number): GateWeights {
  const trust = Math.max(0, Math.min(1, (snapshotDays - 2) / 19)); // 0 at ≤2d → 1 at 21d
  const rising = 0.15 + 0.25 * trust; // 0.15 → 0.40
  const lowFruit = 0.55 - 0.15 * trust; // 0.55 → 0.40
  const recency = 1 - rising - lowFruit; // 0.30 → 0.20
  return { rising, recency, lowFruit };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** 0–100 gate score for one candidate. Pure; safe to call over the full pool. */
export function gateScore(c: IdeaCandidate, weights: GateWeights, nowMs: number): number {
  // Rising: growth score (already 0–100) plus a charting bonus.
  const growth = clamp01((c.growthScore ?? 0) / 100);
  const charting = c.chartRank !== null ? clamp01((201 - c.chartRank) / 200) : 0;
  const rising = 0.7 * growth + 0.3 * charting;

  // Recency: full credit inside ~90 days, fading to zero by 2 years.
  const ageDays = c.releasedAt ? (nowMs - c.releasedAt.getTime()) / 86_400_000 : Infinity;
  const recency = ageDays <= 90 ? 1 : clamp01(1 - (ageDays - 90) / 640);

  // Low-hanging fruit: revenue proves demand, a weak rating proves the gap.
  const revenue = clamp01((c.revenueEstimate ?? 0) / 20_000);
  const ratingGap = c.rating !== null ? clamp01((4.4 - c.rating) / 1.4) : 0;
  const lowFruit = revenue * (0.35 + 0.65 * ratingGap);

  return 100 * (weights.rising * rising + weights.recency * recency + weights.lowFruit * lowFruit);
}

/** Top `limit` candidates by gate score, deterministic order. */
export function selectIdeaSources(
  candidates: readonly IdeaCandidate[],
  snapshotDays: number,
  limit: number,
  nowMs: number,
): IdeaCandidate[] {
  const weights = gateWeights(snapshotDays);
  return candidates
    .map((c) => ({ c, score: gateScore(c, weights, nowMs) }))
    .sort((a, b) => b.score - a.score || a.c.appId.localeCompare(b.c.appId))
    .slice(0, limit)
    .map((x) => x.c);
}
