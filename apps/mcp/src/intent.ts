/**
 * Intent-layer synthesis (lane L5, epic #97). Pure functions that turn raw
 * market data into a canonical `DecisionPacket` — no I/O, fully testable. The
 * MCP tool handlers fetch the data, call these, and (optionally) persist to the
 * build context. Honesty: every observed claim carries a store URL; blocked
 * sources are named in `coverage.missing`, never fabricated.
 */
import type { DecisionPacket, Evidence } from "@kittie/types";
import { buildDecisionPacket } from "@kittie/intelligence";

/** The subset of a market-app row the synthesis needs. */
export interface MarketApp {
  id: string;
  store: string;
  title: string;
  rating: number | null;
  reviewCount: number;
}

/** Canonical public store URL for an app id like `apple:123` / `google:com.x`. */
export function appStoreUrl(app: MarketApp): string {
  const storeId = app.id.includes(":") ? (app.id.split(":")[1] ?? app.id) : app.id;
  return app.store === "google"
    ? `https://play.google.com/store/apps/details?id=${storeId}`
    : `https://apps.apple.com/app/id${storeId}`;
}

export interface OpportunityInput {
  niche: string;
  apps: MarketApp[];
  /** Improvement themes mined from competitor reviews, or null if not fetched. */
  reviewThemes: string[] | null;
  /** ISO-8601 instant the data was observed. */
  observedAt: string;
  snapshotId: string;
}

/** Threshold above which a niche is treated as crowded. */
const SATURATED_AT = 20;

/**
 * Synthesise a market-opportunity `DecisionPacket` from OBSERVED competitor
 * facts. Confidence scales with the competitor sample; ad-spend is always a
 * declared gap (blocked source); review themes are a gap until mined.
 */
export function synthesizeOpportunity(input: OpportunityInput): DecisionPacket {
  const { niche, apps, reviewThemes, observedAt, snapshotId } = input;

  const top = [...apps].sort((a, b) => b.reviewCount - a.reviewCount).slice(0, 5);
  const evidence: Evidence[] = top.map((app) => ({
    claim: `${app.title} — ${app.rating ?? "?"}★, ${app.reviewCount.toLocaleString()} reviews`,
    valueType: "observed",
    sourceId: app.id,
    sourceUrl: appStoreUrl(app),
    observedAt,
  }));

  if (reviewThemes && reviewThemes.length > 0) {
    evidence.push({
      claim: `Competitor reviews recurrently mention: ${reviewThemes.join(", ")}`,
      valueType: "derived",
      sourceId: "review-themes",
      sourceUrl: null,
      observedAt,
    });
  }

  const count = apps.length;
  const decision =
    count === 0
      ? `No competitors found for "${niche}" — unvalidated: confirm real demand before building.`
      : count >= SATURATED_AT
        ? `"${niche}" is crowded (${count}+ competitors) — only build with a sharp differentiator.`
        : `"${niche}" has room (${count} competitors) — a focused entrant can win.`;

  const missing = ["Meta advertising data"];
  if (reviewThemes == null) missing.push("competitor review themes");

  const unknowns = count === 0 ? ["actual user demand for this niche"] : [];
  const score = Math.min(0.9, 0.3 + count * 0.03);

  return buildDecisionPacket({
    decision,
    evidence,
    confidence: {
      score,
      reasons: [`${count} competitors observed`, "ad spend unavailable (blocked source)"],
    },
    assumptions: [],
    unknowns,
    recommendedActions: [
      { tool: "mine_reviews", reason: "Turn competitor complaints into a feature backlog", estimatedCost: 0.05 },
      { tool: "aso_keywords", reason: "Find winnable keywords before naming the app", estimatedCost: 0.03 },
    ],
    snapshotId,
    missing,
  });
}
