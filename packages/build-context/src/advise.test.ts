import { describe, expect, it } from "vitest";
import { missing } from "@kittie/core";
import type { Store } from "@kittie/types";
import { adviseNextBuildDecision } from "./advise.js";
import type { BuildContext, DemandCandidate, Preference } from "./types.js";

const NOW = Date.parse("2026-06-23T00:00:00.000Z");

function ctx(overrides: Partial<BuildContext> = {}): BuildContext {
  return {
    schemaVersion: 1,
    contextId: "ctx-1",
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    phase: "validation",
    profile: {
      idea: missing<string>("not_attempted"),
      audience: missing<string>("not_attempted"),
      platforms: missing<Store[]>("not_attempted"),
      markets: missing<string[]>("not_attempted"),
      monetisation: missing<string>("not_attempted"),
      constraints: missing<string[]>("not_attempted"),
      competitors: missing<string[]>("not_attempted"),
    },
    preferences: [],
    unknowns: [],
    ...overrides,
  };
}

function pref(text: string, kind: Preference["kind"]): Preference {
  return { id: text, text, kind, scope: "global", source: "user", createdAt: "", updatedAt: "" };
}

const candidates: DemandCandidate[] = [
  { id: "a", label: "AI meal planner", demandScore: 80, platform: "apple", category: "food" },
  { id: "b", label: "Crypto wallet", demandScore: 90, platform: "apple", category: "finance" },
];

describe("adviseNextBuildDecision", () => {
  it("recommends the highest-demand candidate", () => {
    const packet = adviseNextBuildDecision(ctx(), [], candidates, { now: NOW });
    expect(packet.decision).toBe('Build "Crypto wallet"');
    expect(packet.confidence.score).toBeCloseTo(0.9);
    expect(packet.recommendedActions[0]?.tool).toBe("compute_demand_signal");
    expect(packet.snapshotId).toBe("unpinned");
  });

  it("excludes candidates matching a never/dislike preference", () => {
    const packet = adviseNextBuildDecision(
      ctx(),
      [pref("no crypto please", "never")],
      candidates,
      { now: NOW },
    );
    expect(packet.decision).toBe('Build "AI meal planner"');
  });

  it("boosts candidates matching like/always preferences", () => {
    // meal 80 + 3×5 boost = 95 > crypto 90
    const prefs = [pref("meal", "like"), pref("planner", "like"), pref("food", "like")];
    const packet = adviseNextBuildDecision(ctx(), prefs, candidates, { now: NOW });
    expect(packet.decision).toBe('Build "AI meal planner"');
  });

  it("returns an honest no-recommendation packet when there is nothing eligible", () => {
    const packet = adviseNextBuildDecision(ctx(), [], [], { now: NOW });
    expect(packet.decision).toContain("No build recommendation");
    expect(packet.coverage.status).toBe("none");
    expect(packet.confidence.score).toBe(0);
  });

  it("carries open unknowns into the packet", () => {
    const withUnknown = ctx({
      unknowns: [{ id: "u1", question: "What's the pricing?", field: null, createdAt: "" }],
    });
    const packet = adviseNextBuildDecision(withUnknown, [], candidates, { now: NOW });
    expect(packet.unknowns).toContain("What's the pricing?");
  });
});
