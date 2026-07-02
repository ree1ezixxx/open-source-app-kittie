/**
 * `generate_report` render bridge — turns a fetched intelligence envelope into a
 * rendered report via @kittie/reports. Uses a minimal app-detail envelope (the
 * builder only reads these fields; @kittie/reports already typechecks the full
 * contract).
 */
import { describe, expect, it } from "vitest";
import type { AppDetailIntelligenceResponse } from "@kittie/types";
import { renderReport } from "./report-tool.js";

const appDetailEnvelope = {
  responseType: "app_detail",
  status: "ok",
  data: {
    app: { store: "apple", storeAppId: "6446901002", title: "Focus Timer", developer: "Deep Work Labs", category: "Productivity", iconUrl: null },
    observed: { rating: 4.8, reviewCount: 18420, chartRank: 12, listingMediaCount: 8, hasDescription: true, hasWebsite: true },
    estimated: { downloads30d: 41000, revenue30dUsd: 76000, growthScore: 78, growthPct: 22, isFirstMover: true },
    relationships: { inAppPurchaseCount: 0, metaAdCount: 0, appleSearchAdCount: 0, creatorCount: 0, reviewSampleCount: 0 },
  },
  evidence: [],
  confidence: { score: 0.78, label: "medium", reasons: [] },
  caveats: [],
  metadata: { contractVersion: "2026-07-01", generatedAt: "2026-07-02T00:00:00.000Z", sourceQuery: {}, snapshotId: "s1", chartCountry: "US", growthPeriod: "30d", modelVersion: "v1" },
} as unknown as AppDetailIntelligenceResponse;

describe("renderReport", () => {
  it("renders an app_teardown report with metadata + content", () => {
    const report = renderReport("app_teardown", appDetailEnvelope, "markdown");
    expect(report.template).toBe("app_teardown");
    expect(report.format).toBe("markdown");
    expect(report.contentType).toBe("text/markdown");
    expect(report.byteLength).toBeGreaterThan(0);
    expect(report.title).toContain("Focus Timer");
    expect(report.content).toContain("Focus Timer");
    expect(report.content).toContain("Confidence");
  });

  it("supports json + html formats", () => {
    const json = renderReport("app_teardown", appDetailEnvelope, "json");
    expect(json.contentType).toBe("application/json");
    expect(() => JSON.parse(json.content)).not.toThrow();

    const html = renderReport("app_teardown", appDetailEnvelope, "html");
    expect(html.contentType).toBe("text/html");
    expect(html.content).toContain("<!doctype html>");
  });
});
