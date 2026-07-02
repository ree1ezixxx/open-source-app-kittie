/**
 * Category-pulse report: template + a builder that turns a trends/category
 * intelligence response (#182) into a renderable report contract.
 *
 * Honesty rules (AC): a missing snapshot or an empty movement set surface as
 * caveats, never as a fabricated ranking.
 */
import type {
  IntelligenceCaveat,
  IntelligenceReportContract,
  IntelligenceResponseEnvelope,
  TrendAppResult,
  TrendsResponseData,
} from "@kittie/types";
import type { ReportDocument, ReportSection } from "../document.js";
import type { ReportTemplate } from "../registry.js";

export const CATEGORY_PULSE_TEMPLATE = "category_pulse";

export type TrendsIntelligenceResponse = IntelligenceResponseEnvelope<
  TrendsResponseData,
  "trends"
>;

/** An app improving fast enough to flag as an opportunity. */
export interface CategoryPulseOpportunity {
  appId: string;
  title: string;
  reason: string;
}

export interface CategoryPulseMovementRow {
  rank: number;
  appId: string;
  title: string;
  developer: string;
  reviewGrowthPct: number | null;
  rankDelta: number | null;
  growthScore: number | null;
}

export interface CategoryPulseOutput {
  headline: string;
  category: string | null;
  country: string;
  growthPeriod: string;
  snapshotDate: string | null;
  movement: CategoryPulseMovementRow[];
  opportunities: CategoryPulseOpportunity[];
}

export interface BuildCategoryPulseOptions {
  reportId?: string;
  expiresAt?: string | null;
  /** Growth-score threshold above which an app is flagged an opportunity. */
  opportunityScore?: number;
}

const DEFAULT_OPPORTUNITY_SCORE = 60;

function toMovementRow(app: TrendAppResult): CategoryPulseMovementRow {
  return {
    rank: app.rank,
    appId: app.appId,
    title: app.title,
    developer: app.developer,
    reviewGrowthPct: app.movement.reviewGrowthPct,
    rankDelta: app.movement.rankDelta,
    growthScore: app.movement.growthScore,
  };
}

function findOpportunities(apps: TrendAppResult[], threshold: number): CategoryPulseOpportunity[] {
  const out: CategoryPulseOpportunity[] = [];
  for (const app of apps) {
    const score = app.movement.growthScore;
    const rankDelta = app.movement.rankDelta;
    if (score !== null && score >= threshold) {
      out.push({ appId: app.appId, title: app.title, reason: `High growth score (${score}).` });
    } else if (rankDelta !== null && rankDelta > 0) {
      out.push({
        appId: app.appId,
        title: app.title,
        reason: `Climbing the chart (+${rankDelta} ranks).`,
      });
    }
  }
  return out;
}

function honestyCaveats(data: TrendsResponseData): IntelligenceCaveat[] {
  const extra: IntelligenceCaveat[] = [];
  if (data.snapshotDate === null) {
    extra.push({
      kind: "missing_source",
      sourceType: "snapshot",
      message: "No snapshot date is recorded; movement is reported without a fresh baseline.",
    });
  }
  if (data.apps.length === 0) {
    extra.push({
      kind: "weak_evidence",
      sourceType: null,
      message: "No apps met the movement threshold for this category and period.",
    });
  }
  return extra;
}

export function buildCategoryPulseReport(
  response: TrendsIntelligenceResponse,
  options: BuildCategoryPulseOptions = {},
): IntelligenceReportContract<CategoryPulseOutput> {
  const data = response.data;
  const generatedAt = response.metadata.generatedAt;
  const threshold = options.opportunityScore ?? DEFAULT_OPPORTUNITY_SCORE;
  const categorySlug = data.category ?? "all";
  const reportId =
    options.reportId ?? `rpt_pulse_${categorySlug}_${data.country}_${data.snapshotDate ?? "nosnap"}`;

  const output: CategoryPulseOutput = {
    headline: `${data.category ?? "All categories"} — ${data.country} movement over ${data.growthPeriod}`,
    category: data.category,
    country: data.country,
    growthPeriod: data.growthPeriod,
    snapshotDate: data.snapshotDate,
    movement: data.apps.map(toMovementRow),
    opportunities: findOpportunities(data.apps, threshold),
  };

  return {
    reportId,
    template: CATEGORY_PULSE_TEMPLATE,
    format: "json",
    status: response.status === "insufficient" ? "partial" : "complete",
    sourceQuery: response.metadata.sourceQuery,
    evidenceSnapshot: {
      generatedAt,
      evidence: response.evidence,
      caveats: [...response.caveats, ...honestyCaveats(data)],
      confidence: response.confidence,
    },
    output,
    outputMetadata: {
      title: `Category pulse — ${data.category ?? "All categories"} (${data.country})`,
      generatedAt,
      expiresAt: options.expiresAt ?? null,
    },
  };
}

function formatMovementRow(row: CategoryPulseMovementRow): string {
  const parts: string[] = [`#${row.rank} ${row.title} — ${row.developer}`];
  if (row.reviewGrowthPct !== null) parts.push(`reviews ${row.reviewGrowthPct > 0 ? "+" : ""}${row.reviewGrowthPct}%`);
  if (row.rankDelta !== null) parts.push(`rankΔ ${row.rankDelta > 0 ? "+" : ""}${row.rankDelta}`);
  if (row.growthScore !== null) parts.push(`score ${row.growthScore}`);
  return parts.join(" · ");
}

export const categoryPulseTemplate: ReportTemplate = (contract): ReportDocument => {
  const output = contract.output as CategoryPulseOutput | null;
  if (!output) {
    return {
      title: contract.outputMetadata.title,
      summary: "No category-pulse output was produced.",
      sections: [],
    };
  }

  const sections: ReportSection[] = [
    {
      heading: "Category",
      blocks: [
        {
          kind: "keyValue",
          entries: [
            { label: "Category", value: output.category ?? "All categories" },
            { label: "Country", value: output.country },
            { label: "Period", value: output.growthPeriod },
            { label: "Snapshot date", value: output.snapshotDate ?? "—" },
          ],
        },
      ],
    },
    {
      heading: "Ranked movement",
      blocks: [
        output.movement.length > 0
          ? { kind: "list", items: output.movement.map(formatMovementRow) }
          : { kind: "text", text: "No ranked movement for this category and period." },
      ],
    },
    {
      heading: "Opportunities",
      blocks: [
        output.opportunities.length > 0
          ? { kind: "list", items: output.opportunities.map((o) => `${o.title} — ${o.reason}`) }
          : { kind: "text", text: "No standout opportunities in this window." },
      ],
    },
  ];

  return {
    title: contract.outputMetadata.title,
    summary: output.headline,
    sections,
  };
};
