/**
 * Pure human-readable formatters for the intelligence CLI commands. JSON output
 * is handled by the caller via `formatOutput`; these produce the `--json`-off
 * text. Kept pure (data in, string out) so they're unit-testable.
 */
import type {
  AppDetailIntelligenceResponse,
  CompareAppsIntelligenceResponse,
  ValidateAppIdeaResult,
} from "@kittie/types";
import { renderTable } from "./output.js";
import type { TrendsIntelligenceResponse } from "./intelligence-client.js";

function money(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n}`;
}

function numOrDash(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("en-US");
}

function caveatBlock(caveats: { kind: string; message: string }[]): string[] {
  if (caveats.length === 0) return ["Caveats: none"];
  return [`Caveats: ${caveats.length}`, ...caveats.map((c) => `  - ${c.kind}: ${c.message}`)];
}

export function formatAppIntelligence(res: AppDetailIntelligenceResponse): string {
  const { app, observed, estimated } = res.data;
  const lines = [
    `${app.title} (${app.store}:${app.storeAppId})`,
    `Developer: ${app.developer}`,
    `Category: ${app.category ?? "—"}`,
    `Rating: ${observed.rating ?? "—"} (${observed.reviewCount.toLocaleString("en-US")} reviews) · chart ${observed.chartRank === null ? "—" : `#${observed.chartRank}`}`,
    `Est. downloads (30d): ${numOrDash(estimated.downloads30d)} · revenue: ${money(estimated.revenue30dUsd)} · growth ${numOrDash(estimated.growthScore)}${estimated.growthPct === null ? "" : ` (${estimated.growthPct}%)`}${estimated.isFirstMover ? " · FIRST MOVER" : ""}`,
    `Confidence: ${res.confidence.label} (${res.confidence.score.toFixed(2)})`,
    ...caveatBlock(res.caveats),
  ];
  return lines.join("\n");
}

export function formatTrending(res: TrendsIntelligenceResponse): string {
  const { category, country, growthPeriod, apps } = res.data;
  const header = `Trending — ${category ?? "all categories"} · ${country} · ${growthPeriod} · confidence ${res.confidence.label} (${res.confidence.score.toFixed(2)})`;
  if (apps.length === 0) {
    return [header, "", "No trending apps for this category and period."].join("\n");
  }
  const table = renderTable(
    ["#", "App", "Developer", "Growth%", "RankΔ", "Score"],
    apps.map((a) => [
      String(a.rank),
      a.title,
      a.developer,
      a.movement.reviewGrowthPct === null ? "—" : `${a.movement.reviewGrowthPct}`,
      a.movement.rankDelta === null ? "—" : `${a.movement.rankDelta}`,
      a.movement.growthScore === null ? "—" : `${a.movement.growthScore}`,
    ]),
  );
  return [header, "", table].join("\n");
}

export function formatCompare(res: CompareAppsIntelligenceResponse): string {
  const { dimensions, rows, insights } = res.data;
  const headers = ["App", ...dimensions.map((d) => d.label)];
  const tableRows = rows.map((row) => [
    row.title,
    ...dimensions.map((d) => {
      const v = row.values[d.key];
      return v === null || v === undefined ? "—" : String(v);
    }),
  ]);
  const lines = [
    `Compare — ${rows.length} apps · confidence ${res.confidence.label} (${res.confidence.score.toFixed(2)})`,
    "",
    renderTable(headers, tableRows),
  ];
  if (insights.length > 0) {
    lines.push("", "Insights:");
    for (const insight of insights) lines.push(`  - [${insight.kind}] ${insight.message}`);
  }
  return lines.join("\n");
}

export function formatValidate(res: ValidateAppIdeaResult): string {
  const lines = [
    `Verdict: ${res.verdict}`,
    `Confidence: ${res.packet.confidence.score.toFixed(2)}`,
    `Competitors: ${res.competitors.length} — ${res.competitorSummary}`,
  ];
  if (res.recommendedAngle) lines.push(`Angle: ${res.recommendedAngle}`);
  if (res.mvp.length > 0) lines.push("MVP:", ...res.mvp.map((m) => `  - ${m}`));
  if (res.risks.length > 0) lines.push("Risks:", ...res.risks.map((r) => `  - ${r}`));
  lines.push(`Evidence: ${res.packet.evidence.length} item(s)`);
  lines.push("", res.agentSummary);
  return lines.join("\n");
}
