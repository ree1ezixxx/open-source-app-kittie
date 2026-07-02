import { afterEach, describe, expect, it } from "vitest";
import { runAsk } from "./execute";

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

const bits = { evidence: [{ id: "e1", claim: "c" }], confidence: { score: 0.7, label: "medium", reasons: [] }, caveats: [{ kind: "partial_source", sourceType: "review", message: "partial" }] };

describe("runAsk", () => {
  it("app_detail hits /apps/:id, surfaces evidence/confidence/caveats + report link", async () => {
    const seen = mockFetch({ data: { data: { app: { title: "Focus Timer", developer: "DWL", category: "Productivity" } }, ...bits } });
    const r = await runAsk({ intent: "app_detail", appId: "apple:123" });
    expect(seen.url).toContain("/app-intelligence/apps/apple%3A123");
    expect(r.title).toBe("Focus Timer");
    expect(r.confidence?.label).toBe("medium");
    expect(r.evidence).toHaveLength(1);
    expect(r.caveats).toHaveLength(1);
    expect(r.reportHref).toBe("/reports/app_teardown?appId=apple%3A123");
  });

  it("trends hits /trends (top-level) and links to category_pulse with period", async () => {
    const seen = mockFetch({ data: { apps: [{}, {}] }, ...bits });
    const r = await runAsk({ intent: "trends", category: "Productivity", country: "US", period: "30d" });
    const qs = new URLSearchParams(seen.url?.split("?")[1]);
    expect(qs.get("growthPeriod")).toBe("30d");
    expect(r.summary).toContain("2 moving apps");
    expect(r.reportHref).toContain("/reports/category_pulse?");
    expect(r.reportHref).toContain("period=30d");
  });

  it("compare POSTs refs, has no report template", async () => {
    const seen = mockFetch({ data: { data: { rows: [{ title: "A" }, { title: "B" }], insights: [{ kind: "leader", message: "A leads" }] }, ...bits } });
    const r = await runAsk({ intent: "compare", apps: ["apple:1", "focus timer"] });
    expect(seen.init?.method).toBe("POST");
    expect(JSON.parse(String(seen.init?.body))).toEqual({ apps: [{ appId: "apple:1" }, { query: "focus timer" }] });
    expect(r.summary).toBe("A leads");
    expect(r.reportHref).toBeNull();
  });

  it("validate POSTs the idea to /validate-idea and links to build_brief", async () => {
    const seen = mockFetch({ data: { data: { verdict: "has_room", verdictReason: "room exists" }, ...bits } });
    const r = await runAsk({ intent: "validate", idea: "a focus timer" });
    expect(seen.url).toContain("/validate-idea");
    expect(r.summary).toContain("has room");
    expect(r.reportHref).toBe("/reports/build_brief?idea=a%20focus%20timer");
  });

  it("surfaces API errors", async () => {
    mockFetch({ error: "app not found" }, false, 404);
    await expect(runAsk({ intent: "app_detail", appId: "apple:nope" })).rejects.toThrow(/app not found/);
  });
});
