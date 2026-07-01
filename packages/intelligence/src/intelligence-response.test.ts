import { describe, expect, it } from "vitest";
import {
  INTELLIGENCE_CONTRACT_VERSION,
  appDetailResponseExample,
  ideaValidationResponseExample,
  reportResponseExample,
  trendsResponseExample,
  type IntelligenceEvidence,
} from "@kittie/types";
import {
  IntelligenceResponseContractError,
  buildIntelligenceResponse,
} from "./intelligence-response.js";

function baseEvidence(): IntelligenceEvidence {
  return {
    id: "ev_store_reviews",
    claim: "The app has public Store reviews in the selected market.",
    source: { type: "app_store", id: "apple:123456789", url: "https://apps.apple.com/us/app/id123456789" },
    valueKind: "observed",
    sourceStatus: "ok",
    freshness: "fresh",
    observedAt: "2026-07-01T12:00:00Z",
    metric: { name: "review_count", value: 18420, unit: "reviews" },
  };
}

function baseInput() {
  return {
    responseType: "app_detail" as const,
    data: { appId: "apple:123456789" },
    evidence: [baseEvidence()],
    confidence: { score: 0.86, label: "high" as const, reasons: ["fresh Store snapshot"] },
    metadata: {
      generatedAt: "2026-07-01T12:00:00Z",
      sourceQuery: { appId: "apple:123456789" },
      snapshotId: "snapshot_us_2026_07_01",
      chartCountry: "US",
      growthPeriod: "7d",
      modelVersion: "test",
    },
  };
}

describe("intelligence response contracts", () => {
  it("fixtures cover the required response families", () => {
    expect(appDetailResponseExample.responseType).toBe("app_detail");
    expect(trendsResponseExample.responseType).toBe("trends");
    expect(ideaValidationResponseExample.responseType).toBe("idea_validation");
    expect(reportResponseExample.template).toBe("opportunity-brief");
  });

  it("fixtures expose required envelope fields", () => {
    for (const fixture of [appDetailResponseExample, trendsResponseExample, ideaValidationResponseExample]) {
      expect(Object.keys(fixture).sort()).toEqual([
        "caveats",
        "confidence",
        "data",
        "evidence",
        "metadata",
        "responseType",
        "status",
      ]);
      expect(fixture.metadata.contractVersion).toBe(INTELLIGENCE_CONTRACT_VERSION);
      expect(fixture.evidence[0]).toHaveProperty("source.type");
      expect(fixture.confidence.reasons.length).toBeGreaterThan(0);
    }
  });

  it("builds a complete response envelope", () => {
    const response = buildIntelligenceResponse(baseInput());
    expect(response.status).toBe("ok");
    expect(response.metadata.contractVersion).toBe(INTELLIGENCE_CONTRACT_VERSION);
    expect(response.caveats).toEqual([]);
  });

  it("turns missing sources into caveats and lower confidence", () => {
    const response = buildIntelligenceResponse({
      ...baseInput(),
      missingSources: [
        {
          sourceType: "meta_ads",
          message: "Meta ads were not ingested; do not treat this as zero ads.",
        },
      ],
    });

    expect(response.status).toBe("partial");
    expect(response.confidence.score).toBeLessThan(baseInput().confidence.score);
    expect(response.confidence.label).toBe("low");
    expect(response.caveats).toContainEqual({
      kind: "missing_source",
      sourceType: "meta_ads",
      message: "Meta ads were not ingested; do not treat this as zero ads.",
    });
    expect(response.evidence.some((e) => e.metric?.value === 0 && e.source.type === "meta_ads")).toBe(false);
  });

  it("rejects missing required evidence fields", () => {
    const input = baseInput();
    input.evidence = [{ ...baseEvidence(), id: "" }];
    expect(() => buildIntelligenceResponse(input)).toThrow(IntelligenceResponseContractError);
  });

  it("requires observed evidence to cite a source URL", () => {
    const input = baseInput();
    input.evidence = [{ ...baseEvidence(), source: { ...baseEvidence().source, url: null } }];
    expect(() => buildIntelligenceResponse(input)).toThrow(/source.url/);
  });
});
