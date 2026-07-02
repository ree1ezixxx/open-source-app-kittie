/**
 * App-teardown report: template + a builder that turns an app-detail
 * intelligence response (#181) into a renderable report contract.
 *
 * Honesty rules (AC): missing listing media and stale snapshots surface as
 * caveats, never as blank or fabricated claims.
 */
import type {
  AppDetailIntelligenceData,
  AppDetailIntelligenceResponse,
  IntelligenceCaveat,
  IntelligenceReportContract,
} from "@kittie/types";
import type { ReportBlock, ReportDocument, ReportSection } from "../document.js";
import type { ReportTemplate } from "../registry.js";

export const APP_TEARDOWN_TEMPLATE = "app_teardown";

export interface AppTeardownMetric {
  label: string;
  value: string;
  /** `estimated` metrics are modelled, not Store truth — labelled as such. */
  kind: "observed" | "estimated";
}

export interface AppTeardownListingMedia {
  count: number;
  iconUrl: string | null;
}

export interface AppTeardownOutput {
  headline: string;
  app: {
    title: string;
    developer: string;
    category: string | null;
    store: string;
    storeAppId: string;
  };
  metrics: AppTeardownMetric[];
  /** `null` when the app has no listing media (a caveat explains the gap). */
  listingMedia: AppTeardownListingMedia | null;
  takeaways: string[];
}

export interface BuildAppTeardownOptions {
  reportId?: string;
  expiresAt?: string | null;
}

function num(value: number | null, suffix = ""): string {
  return value === null ? "—" : `${value.toLocaleString("en-US")}${suffix}`;
}

function hasCaveat(caveats: IntelligenceCaveat[], kind: IntelligenceCaveat["kind"]): boolean {
  return caveats.some((c) => c.kind === kind);
}

/** Caveats derived from the app-detail data itself (media gaps, stale snapshots). */
function honestyCaveats(
  data: AppDetailIntelligenceData,
  response: AppDetailIntelligenceResponse,
): IntelligenceCaveat[] {
  const extra: IntelligenceCaveat[] = [];
  if (data.observed.listingMediaCount === 0) {
    extra.push({
      kind: "missing_source",
      sourceType: null,
      message: "No listing screenshots or media were available; the media section is omitted.",
    });
  }
  const hasStaleEvidence = response.evidence.some((e) => e.freshness === "stale");
  if (hasStaleEvidence && !hasCaveat(response.caveats, "stale_source")) {
    extra.push({
      kind: "stale_source",
      sourceType: "snapshot",
      message: "One or more snapshots are stale; metrics may lag the current Store state.",
    });
  }
  return extra;
}

function takeaways(data: AppDetailIntelligenceData): string[] {
  const out: string[] = [];
  if (data.estimated.isFirstMover) {
    out.push("Flagged as a first-mover in its category.");
  }
  if (data.estimated.growthPct !== null) {
    out.push(`Estimated growth of ${data.estimated.growthPct}% over the reporting window.`);
  }
  if (data.relationships.metaAdCount === 0) {
    out.push("No Meta ad activity observed — growth appears organic so far.");
  }
  if (out.length === 0) {
    out.push("No standout signals; treat as a baseline listing.");
  }
  return out;
}

export function buildAppTeardownReport(
  response: AppDetailIntelligenceResponse,
  options: BuildAppTeardownOptions = {},
): IntelligenceReportContract<AppTeardownOutput> {
  const data = response.data;
  const generatedAt = response.metadata.generatedAt;
  const reportId =
    options.reportId ?? `rpt_teardown_${data.app.storeAppId}_${response.metadata.snapshotId ?? "nosnap"}`;

  const metrics: AppTeardownMetric[] = [
    { label: "Rating", value: num(data.observed.rating), kind: "observed" },
    { label: "Reviews", value: num(data.observed.reviewCount), kind: "observed" },
    { label: "Chart rank", value: num(data.observed.chartRank), kind: "observed" },
    { label: "Est. downloads (30d)", value: num(data.estimated.downloads30d), kind: "estimated" },
    { label: "Est. revenue (30d)", value: num(data.estimated.revenue30dUsd, " USD"), kind: "estimated" },
    { label: "Growth score", value: num(data.estimated.growthScore), kind: "estimated" },
  ];

  const listingMedia: AppTeardownListingMedia | null =
    data.observed.listingMediaCount > 0
      ? { count: data.observed.listingMediaCount, iconUrl: data.app.iconUrl }
      : null;

  const output: AppTeardownOutput = {
    headline: `${data.app.title} — ${data.app.category ?? "Uncategorised"} teardown`,
    app: {
      title: data.app.title,
      developer: data.app.developer,
      category: data.app.category,
      store: data.app.store,
      storeAppId: data.app.storeAppId,
    },
    metrics,
    listingMedia,
    takeaways: takeaways(data),
  };

  return {
    reportId,
    template: APP_TEARDOWN_TEMPLATE,
    format: "json",
    status: response.status === "insufficient" ? "partial" : "complete",
    sourceQuery: response.metadata.sourceQuery,
    evidenceSnapshot: {
      generatedAt,
      evidence: response.evidence,
      caveats: [...response.caveats, ...honestyCaveats(data, response)],
      confidence: response.confidence,
    },
    output,
    outputMetadata: {
      title: `App teardown — ${data.app.title}`,
      generatedAt,
      expiresAt: options.expiresAt ?? null,
    },
  };
}

export const appTeardownTemplate: ReportTemplate = (contract): ReportDocument => {
  const output = contract.output as AppTeardownOutput | null;
  if (!output) {
    return {
      title: contract.outputMetadata.title,
      summary: "No app-teardown output was produced.",
      sections: [],
    };
  }

  const sections: ReportSection[] = [
    {
      heading: "App summary",
      blocks: [
        {
          kind: "keyValue",
          entries: [
            { label: "Title", value: output.app.title },
            { label: "Developer", value: output.app.developer },
            { label: "Category", value: output.app.category ?? "—" },
            { label: "Store", value: output.app.store },
            { label: "Store app ID", value: output.app.storeAppId },
          ],
        },
      ],
    },
    {
      heading: "Metrics",
      blocks: [
        {
          kind: "keyValue",
          entries: output.metrics.map((m) => ({
            label: m.kind === "estimated" ? `${m.label} (estimated)` : m.label,
            value: m.value,
          })),
        },
      ],
    },
  ];

  if (output.listingMedia) {
    const mediaBlocks: ReportBlock[] = [
      {
        kind: "keyValue",
        entries: [
          { label: "Listing assets", value: String(output.listingMedia.count) },
          { label: "Icon", value: output.listingMedia.iconUrl ?? "—" },
        ],
      },
    ];
    sections.push({ heading: "Listing media", blocks: mediaBlocks });
  }

  sections.push({
    heading: "Takeaways",
    blocks: [{ kind: "list", items: output.takeaways }],
  });

  return {
    title: contract.outputMetadata.title,
    summary: output.headline,
    sections,
  };
};
