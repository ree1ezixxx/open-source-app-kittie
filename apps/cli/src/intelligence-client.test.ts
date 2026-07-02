import { afterEach, describe, expect, it } from "vitest";
import {
  ApiError,
  compareApps,
  getAppIntelligence,
  getTrending,
  validateIdea,
} from "./intelligence-client.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Seen {
  url?: string;
  init?: RequestInit;
}

function stubFetch(body: unknown, ok = true, status = 200): Seen {
  const seen: Seen = {};
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    seen.url = url;
    seen.init = init;
    return { ok, status, text: async () => (body === undefined ? "" : JSON.stringify(body)) } as unknown as Response;
  }) as unknown as typeof fetch;
  return seen;
}

describe("getAppIntelligence", () => {
  it("hits the app-intelligence route and unwraps { data }", async () => {
    const seen = stubFetch({ data: { responseType: "app_detail", marker: 1 } });
    const res = (await getAppIntelligence("apple:123")) as unknown as { marker: number };
    expect(seen.url).toContain("/api/v1/app-intelligence/apps/apple%3A123");
    expect(res.marker).toBe(1);
  });
});

describe("getTrending", () => {
  it("maps period→growthPeriod and passes filters; returns the top-level envelope", async () => {
    const envelope = { responseType: "trends", data: { apps: [] }, marker: 2 };
    const seen = stubFetch(envelope);
    const res = (await getTrending({ category: "Productivity", country: "GB", period: "30d", limit: 5 })) as unknown as {
      marker: number;
    };
    const qs = new URLSearchParams(seen.url?.split("?")[1]);
    expect(qs.get("category")).toBe("Productivity");
    expect(qs.get("country")).toBe("GB");
    expect(qs.get("growthPeriod")).toBe("30d");
    expect(qs.get("limit")).toBe("5");
    expect(res.marker).toBe(2); // not unwrapped — full envelope preserved
  });
});

describe("compareApps", () => {
  it("POSTs { apps } and unwraps { data }", async () => {
    const seen = stubFetch({ data: { responseType: "compare_apps", marker: 3 } });
    const res = (await compareApps([{ appId: "apple:1" }, { query: "focus" }])) as unknown as { marker: number };
    expect(seen.init?.method).toBe("POST");
    expect(JSON.parse(String(seen.init?.body))).toEqual({ apps: [{ appId: "apple:1" }, { query: "focus" }] });
    expect(res.marker).toBe(3);
  });
});

describe("validateIdea", () => {
  it("POSTs the idea to the canonical validate-idea path and unwraps { data }", async () => {
    const seen = stubFetch({ data: { responseType: "idea_validation", marker: 4 } });
    const res = (await validateIdea({ idea: "a focus timer" })) as unknown as { marker: number };
    expect(seen.url).toContain("/api/v1/app-intelligence/validate-idea");
    expect(JSON.parse(String(seen.init?.body))).toEqual({ idea: "a focus timer" });
    expect(res.marker).toBe(4);
  });
});

describe("error mapping", () => {
  it("surfaces the API error message + status on non-2xx", async () => {
    stubFetch({ error: "app not found" }, false, 404);
    await expect(getAppIntelligence("apple:nope")).rejects.toMatchObject({
      name: "ApiError",
      message: "app not found",
      status: 404,
    });
  });

  it("gives a clear unreachable-API error when fetch throws", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const err = await getTrending().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBeNull();
    expect((err as ApiError).message).toContain("Cannot reach the API");
  });
});
