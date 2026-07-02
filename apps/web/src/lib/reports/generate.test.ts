import { afterEach, describe, expect, it } from "vitest";
import { generateReport } from "./generate";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Seen {
  url?: string;
  init?: RequestInit;
}

function mockFetch(body: unknown, ok = true, status = 200): Seen {
  const seen: Seen = {};
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    seen.url = url;
    seen.init = init;
    return { ok, status, text: async () => (body === undefined ? "" : JSON.stringify(body)) } as unknown as Response;
  }) as unknown as typeof fetch;
  return seen;
}

const appDetailEnvelope = {
  responseType: "app_detail",
  status: "ok",
  data: {
    app: { store: "apple", storeAppId: "123", title: "Focus Timer", developer: "Deep Work Labs", category: "Productivity", iconUrl: null },
    observed: { rating: 4.8, reviewCount: 18420, chartRank: 12, listingMediaCount: 8, hasDescription: true, hasWebsite: true },
    estimated: { downloads30d: 41000, revenue30dUsd: 76000, growthScore: 78, growthPct: 22, isFirstMover: true },
    relationships: { inAppPurchaseCount: 0, metaAdCount: 0, appleSearchAdCount: 0, creatorCount: 0, reviewSampleCount: 0 },
  },
  evidence: [],
  confidence: { score: 0.78, label: "medium", reasons: [] },
  caveats: [],
  metadata: { contractVersion: "2026-07-01", generatedAt: "2026-07-02T00:00:00.000Z", sourceQuery: {}, snapshotId: "s1", chartCountry: "US", growthPeriod: "30d", modelVersion: "v1" },
};

const trendsEnvelope = {
  responseType: "trends",
  status: "partial",
  data: { category: "Productivity", country: "US", growthPeriod: "7d", limit: 10, snapshotDate: "2026-07-01", apps: [] },
  evidence: [],
  confidence: { score: 0.5, label: "low", reasons: [] },
  caveats: [],
  metadata: { contractVersion: "2026-07-01", generatedAt: "2026-07-02T00:00:00.000Z", sourceQuery: {}, snapshotId: "s1", chartCountry: "US", growthPeriod: "7d", modelVersion: "v1" },
};

describe("generateReport — app_teardown", () => {
  it("fetches the app-detail route (unwrapped) and renders all three formats", async () => {
    const seen = mockFetch({ data: appDetailEnvelope });
    const report = await generateReport("app_teardown", { appId: "apple:123" });
    expect(seen.url).toContain("/api/v1/app-intelligence/apps/apple%3A123");
    expect(seen.init?.method).toBe("GET");
    expect(Object.keys(report.formats)).toEqual(["markdown", "json", "html"]);
    expect(report.formats.markdown.content).toContain("Focus Timer");
    expect(report.formats.html.content).toContain("<!doctype html>");
    expect(() => JSON.parse(report.formats.json.content)).not.toThrow();
  });

  it("rejects a missing app id before calling the API", async () => {
    await expect(generateReport("app_teardown", {})).rejects.toThrow(/app id is required/i);
  });
});

describe("generateReport — category_pulse", () => {
  it("builds the trends query (top-level envelope)", async () => {
    const seen = mockFetch(trendsEnvelope);
    const report = await generateReport("category_pulse", { category: "Productivity", country: "GB", period: "30d" });
    const qs = new URLSearchParams(seen.url?.split("?")[1]);
    expect(qs.get("category")).toBe("Productivity");
    expect(qs.get("country")).toBe("GB");
    expect(qs.get("growthPeriod")).toBe("30d");
    expect(report.formats.markdown.content).toContain("Category pulse");
  });

  it("defaults country=US and period=7d", async () => {
    const seen = mockFetch(trendsEnvelope);
    await generateReport("category_pulse", {});
    const qs = new URLSearchParams(seen.url?.split("?")[1]);
    expect(qs.get("country")).toBe("US");
    expect(qs.get("growthPeriod")).toBe("7d");
  });
});

describe("generateReport — build_brief", () => {
  const validateEnvelope = {
    responseType: "idea_validation",
    status: "ok",
    data: {
      idea: "a focus timer",
      interpreted: { summary: "", categories: [], keywords: [], kind: "inferred" },
      likelyCategory: "Productivity",
      verdict: "has_room",
      verdictReason: "Room in the category.",
      scores: {},
      risks: [],
      opportunities: [],
      competitors: [],
    },
    evidence: [],
    confidence: { score: 0.6, label: "medium", reasons: [] },
    caveats: [],
    metadata: { contractVersion: "2026-07-01", generatedAt: "2026-07-02T00:00:00.000Z", sourceQuery: {}, snapshotId: "s1", chartCountry: "US", growthPeriod: "7d", modelVersion: "v1" },
  };

  it("POSTs the idea to /validate-idea", async () => {
    const seen = mockFetch({ data: validateEnvelope });
    const report = await generateReport("build_brief", { idea: "a focus timer" });
    expect(seen.url).toContain("/api/v1/app-intelligence/validate-idea");
    expect(seen.init?.method).toBe("POST");
    expect(JSON.parse(String(seen.init?.body))).toEqual({ idea: "a focus timer" });
    expect(report.formats.markdown.content).toContain("Build brief");
  });

  it("rejects an empty idea", async () => {
    await expect(generateReport("build_brief", { idea: "  " })).rejects.toThrow(/idea is required/i);
  });
});

describe("generateReport — API errors", () => {
  it("surfaces the API error message on non-2xx", async () => {
    mockFetch({ error: "app not found" }, false, 404);
    await expect(generateReport("app_teardown", { appId: "apple:nope" })).rejects.toThrow(/app not found/);
  });
});
