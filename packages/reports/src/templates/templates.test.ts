import { describe, expect, it } from "vitest";
import { renderReportContent } from "../render.js";
import {
  appDetailFixture,
  appDetailNoMediaFixture,
  trendsFixture,
} from "./fixtures.js";
import { buildAppTeardownReport } from "./app-teardown.js";
import { buildCategoryPulseReport } from "./category-pulse.js";
import { createReportRegistry } from "./index.js";

const FORMATS = ["json", "markdown", "html"] as const;
const registry = createReportRegistry();

describe("app-teardown template", () => {
  const contract = buildAppTeardownReport(appDetailFixture);

  it("routes through the registered template (not the generic fallback)", () => {
    expect(contract.template).toBe("app_teardown");
    expect(registry.has("app_teardown")).toBe(true);
  });

  it("includes summary, metrics, evidence, confidence, caveats, and media in every format", () => {
    for (const format of FORMATS) {
      const { content } = renderReportContent(contract, format, registry);
      const text = format === "json" ? content : content;
      // App summary + metrics.
      expect(text).toContain("Focus Timer");
      expect(text).toContain("Deep Work Labs");
      expect(text).toMatch(/76,?000/); // est revenue
      // Evidence + confidence + caveats (appended by renderers from the snapshot).
      if (format !== "json") {
        expect(content).toContain("medium (0.78)");
        expect(content).toContain("18,420 public App Store reviews");
        expect(content).toContain("Estimated metrics");
      } else {
        const parsed = JSON.parse(content);
        expect(parsed.confidence.label).toBe("medium");
        expect(parsed.evidence.length).toBeGreaterThan(0);
        expect(parsed.caveats.length).toBeGreaterThan(0);
      }
    }
  });

  it("renders listing media only when present", () => {
    const withMedia = renderReportContent(contract, "markdown", registry).content;
    expect(withMedia).toContain("Listing media");
    expect(withMedia).toContain("Listing assets");
  });

  it("turns missing media and stale snapshots into caveats, not blank claims", () => {
    const bare = buildAppTeardownReport(appDetailNoMediaFixture);
    const md = renderReportContent(bare, "markdown", registry).content;
    expect(md).not.toContain("Listing media");
    const caveatKinds = bare.evidenceSnapshot.caveats.map((c) => c.kind);
    expect(caveatKinds).toContain("missing_source");
    expect(caveatKinds).toContain("stale_source");
    expect(md).toContain("No listing screenshots");
    expect(md).toContain("stale");
  });

  it("is deterministic across renders (golden)", () => {
    for (const format of FORMATS) {
      const a = renderReportContent(contract, format, registry).content;
      const b = renderReportContent(contract, format, registry).content;
      expect(a).toBe(b);
    }
  });
});

describe("category-pulse template", () => {
  const contract = buildCategoryPulseReport(trendsFixture);

  it("routes through the registered template", () => {
    expect(contract.template).toBe("category_pulse");
    expect(registry.has("category_pulse")).toBe(true);
  });

  it("includes ranked movement, opportunities, evidence, confidence, and caveats", () => {
    for (const format of FORMATS) {
      const { content } = renderReportContent(contract, format, registry);
      expect(content).toContain("Focus Timer");
      if (format !== "json") {
        expect(content).toContain("Ranked movement");
        expect(content).toContain("Opportunities");
        expect(content).toContain("low (0.52)");
        expect(content).toContain("Meta ads were not ingested");
      } else {
        const parsed = JSON.parse(content);
        expect(parsed.document.sections.map((s: { heading: string }) => s.heading)).toContain(
          "Opportunities",
        );
        expect(parsed.confidence.label).toBe("low");
      }
    }
  });

  it("flags the high-growth app as an opportunity and excludes the laggard", () => {
    expect(contract.output?.opportunities.map((o) => o.appId)).toEqual(["apple:6446901002"]);
  });

  it("adds honesty caveats when there is no snapshot or no movement", () => {
    const empty = buildCategoryPulseReport({
      ...trendsFixture,
      data: { ...trendsFixture.data, snapshotDate: null, apps: [] },
    });
    const kinds = empty.evidenceSnapshot.caveats.map((c) => c.kind);
    expect(kinds).toContain("missing_source");
    expect(kinds).toContain("weak_evidence");
    const md = renderReportContent(empty, "markdown", registry).content;
    expect(md).toContain("No ranked movement");
  });
});
