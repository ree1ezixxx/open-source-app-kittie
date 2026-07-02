import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeardownAppOutput } from "@kittie/intelligence";
import { teardownRouter } from "./teardown.js";

const mocks = vi.hoisted(() => ({ getAppTeardown: vi.fn() }));

vi.mock("../../services/teardown-service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/teardown-service.js")>();
  return { ...actual, getAppTeardown: mocks.getAppTeardown };
});

/** Minimal teardown blueprint — only the fields the envelope adapter reads matter. */
function fakeTeardown(): TeardownAppOutput {
  return {
    depth: "quick",
    identity: {
      id: "apple:1",
      store: "apple",
      title: "Focus",
      developer: "Dev",
      category: "Productivity",
      iconUrl: null,
      storeUrl: "https://apps.apple.com/app/id1",
      isFirstMover: false,
    },
    decisionPacket: {
      decision: "Focus: 4.5 stars over 1,200 reviews.",
      evidence: [
        {
          claim: "Focus — 4.5 stars, 1,200 reviews",
          valueType: "observed",
          sourceId: "apple:1",
          sourceUrl: "https://apps.apple.com/app/id1",
          observedAt: "2026-07-01T00:00:00.000Z",
        },
        {
          claim: "Modelled 30d: ~1000 downloads, ~5000 revenue",
          valueType: "modelled",
          sourceId: "model:revenue",
          sourceUrl: null,
          observedAt: "2026-07-01T00:00:00.000Z",
        },
      ],
      confidence: { score: 0.7, reasons: ["1,200 reviews observed"] },
      coverage: { status: "partial", missing: ["Meta advertising data"] },
      assumptions: [],
      unknowns: [],
      recommendedActions: [],
      snapshotId: "snap_1",
    },
  } as unknown as TeardownAppOutput;
}

describe("teardown route — #180 envelope", () => {
  beforeEach(() => mocks.getAppTeardown.mockReset());

  it("wraps GET teardown in the canonical envelope under {data}", async () => {
    mocks.getAppTeardown.mockResolvedValue(fakeTeardown());

    const res = await teardownRouter.request("/apps/apple:1/teardown");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;

    // Canonical placement: envelope nested under a single outer `data`.
    const env = body.data;
    expect(env.responseType).toBe("teardown");
    // 2 evidence + 1 missing source → partial.
    expect(env.status).toBe("partial");
    expect(env.confidence.label).toBeDefined();
    expect(env.evidence).toHaveLength(2);
    // Observed store fact keeps its URL; the model row maps to source model.
    expect(env.evidence[0].source.type).toBe("app_store");
    expect(env.evidence[1].source.type).toBe("model");
    // Missing source surfaces as a typed caveat.
    expect(
      env.caveats.some((c: any) => c.kind === "missing_source" && c.sourceType === "meta_ads"),
    ).toBe(true);

    // No data regression: the blueprint is preserved verbatim inside envelope.data,
    // including the DecisionPacket's own pre-cap confidence.
    expect(env.data.identity.title).toBe("Focus");
    expect(env.data.decisionPacket.snapshotId).toBe("snap_1");
    expect(env.data.decisionPacket.confidence.score).toBe(0.7);
    // Envelope confidence applies the standard missing-source cap (< raw 0.7).
    expect(env.confidence.score).toBeLessThan(0.7);
  });

  it("wraps POST teardown identically", async () => {
    mocks.getAppTeardown.mockResolvedValue(fakeTeardown());

    const res = await teardownRouter.request("/teardown", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: "apple:1" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.responseType).toBe("teardown");
    expect(body.data.data.identity.id).toBe("apple:1");
  });

  it("404s an unknown app without wrapping", async () => {
    mocks.getAppTeardown.mockResolvedValue(null);
    const res = await teardownRouter.request("/apps/nope/teardown");
    expect(res.status).toBe(404);
  });
});
