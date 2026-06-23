import { describe, expect, it } from "vitest";
import {
  applyFreshness,
  derived,
  downgradeCoverage,
  freshnessFrom,
  inferred,
  isMissing,
  isPresent,
  mergeCoverage,
  missing,
  modelled,
  observed,
  worstCoverage,
} from "./provenance.js";

describe("constructors", () => {
  it("observed() is a present, ok-coverage fact carrying every provenance field", () => {
    const p = observed(42, {
      source: "apple:rss",
      collectionMethod: "rss",
      observedAt: "2026-06-23T00:00:00Z",
    });
    expect(p.value).toBe(42);
    expect(p.kind).toBe("observed");
    expect(p.coverage).toBe("ok");
    expect(Object.keys(p).sort()).toEqual([
      "collectionMethod",
      "confidence",
      "coverage",
      "freshness",
      "kind",
      "licenseClass",
      "observedAt",
      "source",
      "transformVersion",
      "value",
    ]);
  });

  it("modelled / derived / inferred carry their kind and default to ok coverage", () => {
    expect(modelled(1).kind).toBe("modelled");
    expect(derived(1).kind).toBe("derived");
    expect(inferred(1).kind).toBe("inferred");
    expect(modelled(1).coverage).toBe("ok");
  });
});

describe("the invariant: no empty value without a reason", () => {
  it("missing() refuses an ok coverage", () => {
    // @ts-expect-error — "ok" is not an AbsentCoverage; runtime guard backs the type.
    expect(() => missing<number>("ok")).toThrow();
  });

  it("missing() yields a null value with kind missing and the given coverage", () => {
    const p = missing<number>("scrape_failed");
    expect(p.value).toBeNull();
    expect(p.kind).toBe("missing");
    expect(p.coverage).toBe("scrape_failed");
  });
});

describe("guards", () => {
  it("isPresent / isMissing", () => {
    expect(isPresent(modelled(1))).toBe(true);
    expect(isPresent(missing<number>("not_attempted"))).toBe(false);
    expect(isMissing(missing<number>("not_attempted"))).toBe(true);
    expect(isMissing(observed(1))).toBe(false);
  });
});

describe("coverage merge / downgrade", () => {
  it("stale + ok => stale", () => {
    expect(worstCoverage("stale", "ok")).toBe("stale");
    expect(worstCoverage("ok", "stale")).toBe("stale");
  });

  it("ok + ok => ok", () => {
    expect(worstCoverage("ok", "ok")).toBe("ok");
  });

  it("scrape_failed is worse than stale", () => {
    expect(worstCoverage("stale", "scrape_failed")).toBe("scrape_failed");
  });

  it("mergeCoverage folds to the worst; empty list => not_attempted", () => {
    expect(mergeCoverage(["ok", "stale", "ok"])).toBe("stale");
    expect(mergeCoverage(["ok", "ok"])).toBe("ok");
    expect(mergeCoverage([])).toBe("not_attempted");
  });

  it("downgradeCoverage never improves coverage", () => {
    expect(downgradeCoverage(observed(1), "stale").coverage).toBe("stale");
    // already worse than "stale" — stays put
    expect(downgradeCoverage(missing<number>("scrape_failed"), "stale").coverage).toBe(
      "scrape_failed",
    );
    // asked to downgrade to ok — no-op, keeps the worse status
    expect(downgradeCoverage(observed(1), "ok").coverage).toBe("ok");
  });
});

describe("freshness", () => {
  const now = Date.parse("2026-06-23T00:00:00Z");
  const DAY = 86_400_000;

  it("classifies by age window", () => {
    expect(freshnessFrom("2026-06-23T00:00:00Z", now, DAY)).toBe("fresh");
    expect(freshnessFrom("2026-06-21T12:00:00Z", now, DAY)).toBe("aging");
    expect(freshnessFrom("2026-06-10T00:00:00Z", now, DAY)).toBe("stale");
    expect(freshnessFrom(null, now, DAY)).toBe("unknown");
    expect(freshnessFrom("not-a-date", now, DAY)).toBe("unknown");
  });

  it("applyFreshness downgrades coverage to stale once aged out", () => {
    const old = observed(1, { observedAt: "2026-06-01T00:00:00Z" });
    const fresh = observed(1, { observedAt: "2026-06-23T00:00:00Z" });
    expect(applyFreshness(old, now, DAY).freshness).toBe("stale");
    expect(applyFreshness(old, now, DAY).coverage).toBe("stale");
    expect(applyFreshness(fresh, now, DAY).coverage).toBe("ok");
    expect(applyFreshness(fresh, now, DAY).freshness).toBe("fresh");
  });
});
