import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FindSimilarAppsResult } from "@kittie/types";
import { similarRouter } from "./similar.js";

const mocks = vi.hoisted(() => ({ findSimilarApps: vi.fn() }));

vi.mock("../../services/similar-apps-service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/similar-apps-service.js")>();
  return { ...actual, findSimilarApps: mocks.findSimilarApps };
});

/** Minimal ranked result — only the fields the envelope adapter reads matter. */
function fakeSimilar(): FindSimilarAppsResult {
  return {
    interpretedQuery: { summary: "focus timer apps" },
    similar: [
      {
        app: { id: "apple:2", store: "apple", title: "Forest", category: "Productivity" },
        similarityScore: 0.82,
        similarityClass: "direct",
        similarityReasons: ["shared keyword: focus"],
        matchedVia: ["keyword_overlap"],
      },
    ],
    confidence: { score: 0.6, reasons: ["3 competitors observed"] },
    missing: ["Meta advertising data"],
    agentSummary: "One direct competitor found.",
  } as unknown as FindSimilarAppsResult;
}

const post = (payload: unknown) =>
  similarRouter.request("/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

describe("similar route — #180 envelope", () => {
  beforeEach(() => mocks.findSimilarApps.mockReset());

  it("wraps the ranked result in the canonical envelope under {data}", async () => {
    mocks.findSimilarApps.mockResolvedValue(fakeSimilar());

    const res = await post({ query: "focus" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;

    const env = body.data;
    expect(env.responseType).toBe("similar");
    // 1 evidence + 1 missing source → partial.
    expect(env.status).toBe("partial");
    expect(env.evidence).toHaveLength(1);
    expect(env.evidence[0].source.id).toBe("apple:2");
    expect(env.evidence[0].metric).toEqual({ name: "similarityScore", value: 0.82, unit: null });
    expect(
      env.caveats.some((c: any) => c.kind === "missing_source" && c.sourceType === "meta_ads"),
    ).toBe(true);

    // No data regression: full result set preserved verbatim inside envelope.data.
    expect(env.data.similar[0].similarityScore).toBe(0.82);
    expect(env.data.agentSummary).toBe("One direct competitor found.");
    expect(env.data.confidence.score).toBe(0.6);
    // Envelope confidence applies the standard missing-source cap.
    expect(env.confidence.score).toBeLessThanOrEqual(0.59);
  });

  it("returns 400 on invalid JSON", async () => {
    const res = await similarRouter.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    });
    expect(res.status).toBe(400);
  });
});
