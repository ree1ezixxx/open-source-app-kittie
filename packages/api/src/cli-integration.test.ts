/**
 * CLI ↔ API integration smoke (#220).
 *
 * Drives the REAL CLI intelligence client (`@kittie/cli/intelligence-client`)
 * against the REAL mounted routes (`createApp()`), with the service layer
 * mocked to fixtures — no live DB, no network, no `fetch` stubs in the client.
 * `globalThis.fetch` is bridged to `app.request()`, so the client's actual URL
 * building + envelope parsing is exercised end-to-end.
 *
 * This is the gap #217's unit tests (which stub `fetch`) can't cover: a route
 * rename/removal (e.g. `/validate` → `/validate-idea`) fails HERE.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAppDetailIntelligence: vi.fn(),
  getCategoryPulse: vi.fn(),
  getCompareAppsIntelligence: vi.fn(),
  getValidateIdeaIntelligence: vi.fn(),
}));

vi.mock("./services/app-detail-intelligence-service.js", async (io) => ({
  ...(await io<typeof import("./services/app-detail-intelligence-service.js")>()),
  getAppDetailIntelligence: mocks.getAppDetailIntelligence,
}));
vi.mock("./services/trends-service.js", async (io) => ({
  ...(await io<typeof import("./services/trends-service.js")>()),
  getCategoryPulse: mocks.getCategoryPulse,
}));
vi.mock("./services/compare-apps-intelligence-service.js", async (io) => ({
  ...(await io<typeof import("./services/compare-apps-intelligence-service.js")>()),
  getCompareAppsIntelligence: mocks.getCompareAppsIntelligence,
}));
vi.mock("./services/validate-idea-intelligence-service.js", async (io) => ({
  ...(await io<typeof import("./services/validate-idea-intelligence-service.js")>()),
  getValidateIdeaIntelligence: mocks.getValidateIdeaIntelligence,
}));

import { createApp } from "./app.js";
import {
  compareApps,
  getAppIntelligence,
  getTrending,
  validateIdea,
} from "@kittie/cli/intelligence-client";

const app = createApp();
const BASE = "http://cli-int.test";
const realFetch = globalThis.fetch;

/** Envelope-shaped fixture with a marker field so we can prove it round-trips. */
function envelope(responseType: string, marker: string, data: unknown = {}) {
  return { responseType, status: "ok", data, evidence: [], confidence: { score: 1, label: "high", reasons: [] }, caveats: [], marker };
}

beforeAll(() => {
  process.env.KITTIE_API_URL = BASE;
  process.env.KITTIE_CONFIG_HOME = "/tmp/kittie-cli-int-nonexistent"; // hermetic: ignore any real ~/.kittie
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.startsWith(BASE)) {
      const u = new URL(url);
      return app.request(u.pathname + u.search, init);
    }
    return realFetch(input as string, init);
  }) as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
  delete process.env.KITTIE_API_URL;
  delete process.env.KITTIE_CONFIG_HOME;
});

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
});

describe("CLI intelligence commands hit the real mounted routes", () => {
  it("app → GET /app-intelligence/apps/:id (unwraps {data})", async () => {
    mocks.getAppDetailIntelligence.mockResolvedValue(envelope("app_detail", "APP"));
    const res = (await getAppIntelligence("apple:123")) as unknown as { marker: string };
    expect(mocks.getAppDetailIntelligence).toHaveBeenCalledTimes(1);
    expect(res.marker).toBe("APP");
  });

  it("trending → GET /app-intelligence/trends (top-level envelope)", async () => {
    mocks.getCategoryPulse.mockResolvedValue(envelope("trends", "TRENDS", { apps: [] }));
    const res = (await getTrending({ category: "Productivity", country: "US", period: "7d" })) as unknown as { marker: string };
    expect(mocks.getCategoryPulse).toHaveBeenCalledTimes(1);
    expect(res.marker).toBe("TRENDS");
  });

  it("compare → POST /app-intelligence/compare-apps (unwraps {data})", async () => {
    mocks.getCompareAppsIntelligence.mockResolvedValue(envelope("compare_apps", "COMPARE"));
    const res = (await compareApps([{ appId: "apple:1" }, { appId: "apple:2" }])) as unknown as { marker: string };
    expect(mocks.getCompareAppsIntelligence).toHaveBeenCalledTimes(1);
    expect(res.marker).toBe("COMPARE");
  });

  it("validate → POST /app-intelligence/validate-idea (canonical route, unwraps {data})", async () => {
    mocks.getValidateIdeaIntelligence.mockResolvedValue(envelope("idea_validation", "VALIDATE"));
    const res = (await validateIdea({ idea: "a focus timer" })) as unknown as { marker: string };
    expect(mocks.getValidateIdeaIntelligence).toHaveBeenCalledTimes(1);
    expect(res.marker).toBe("VALIDATE");
  });
});

describe("a route rename/removal is caught (regression guard)", () => {
  it("a request to the retired /validate path 404s at the real mount", async () => {
    // The client uses /validate-idea; the old /validate must NOT resolve.
    const res = await app.request("/api/v1/app-intelligence/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea: "x" }),
    });
    expect(res.status).toBe(404);
  });

  it("the canonical routes the client targets all resolve (not 404)", async () => {
    mocks.getAppDetailIntelligence.mockResolvedValue(envelope("app_detail", "A"));
    mocks.getCategoryPulse.mockResolvedValue(envelope("trends", "T", { apps: [] }));
    mocks.getCompareAppsIntelligence.mockResolvedValue(envelope("compare_apps", "C"));
    mocks.getValidateIdeaIntelligence.mockResolvedValue(envelope("idea_validation", "V"));
    const paths: [string, RequestInit][] = [
      ["/api/v1/app-intelligence/apps/apple:1", { method: "GET" }],
      ["/api/v1/app-intelligence/trends?country=US&growthPeriod=7d", { method: "GET" }],
      ["/api/v1/app-intelligence/compare-apps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apps: [{ appId: "apple:1" }, { appId: "apple:2" }] }) }],
      ["/api/v1/app-intelligence/validate-idea", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idea: "x" }) }],
    ];
    for (const [path, init] of paths) {
      const res = await app.request(path, init);
      expect(res.status, `${path} should be mounted`).not.toBe(404);
    }
  });
});
