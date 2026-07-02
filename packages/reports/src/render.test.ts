import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleReport } from "./fixtures.js";
import { createDefaultRegistry, ReportTemplateRegistry } from "./registry.js";
import {
  renderAllFormats,
  renderReportContent,
  reportFileName,
} from "./render.js";
import { writeReport } from "./fs.js";

const FORMATS = ["json", "markdown", "html"] as const;

describe("renderReportContent", () => {
  it("renders the fixture to every format", () => {
    for (const format of FORMATS) {
      const result = renderReportContent(sampleReport, format);
      expect(result.format).toBe(format);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.byteLength).toBe(Buffer.byteLength(result.content, "utf8"));
      expect(result.outputPath).toBeNull();
      expect(result.metadata.title).toBe("App teardown — Focus");
    }
  });

  it("surfaces evidence, confidence, and caveats in the human formats", () => {
    for (const format of ["markdown", "html"] as const) {
      const { content } = renderReportContent(sampleReport, format);
      // Confidence label + reasons.
      expect(content).toContain("medium (0.72)");
      expect(content).toContain("Revenue is modelled, not observed.");
      // Evidence claims.
      expect(content).toContain("Reviews grew 38% over the last 30 days.");
      expect(content).toContain("Estimated monthly revenue is around $42k.");
      // Caveats.
      expect(content).toContain("Revenue is a model estimate and may differ from actuals.");
      expect(content).toContain("No ad intelligence available for this app.");
    }
  });

  it("surfaces evidence, confidence, and caveats in JSON", () => {
    const { content } = renderReportContent(sampleReport, "json");
    const parsed = JSON.parse(content);
    expect(parsed.confidence.label).toBe("medium");
    expect(parsed.confidence.score).toBe(0.72);
    expect(parsed.evidence).toHaveLength(2);
    expect(parsed.caveats).toHaveLength(2);
    expect(parsed.document.title).toBe("App teardown — Focus");
  });

  it("is deterministic — identical output across renders (golden)", () => {
    for (const format of FORMATS) {
      const a = renderReportContent(sampleReport, format).content;
      const b = renderReportContent(sampleReport, format).content;
      expect(a).toBe(b);
    }
  });

  it("produces valid, parseable JSON with a stable shape", () => {
    const { content } = renderReportContent(sampleReport, "json");
    const parsed = JSON.parse(content);
    expect(Object.keys(parsed).sort()).toEqual(
      ["caveats", "confidence", "document", "evidence", "metadata", "reportId", "status", "template"].sort(),
    );
  });

  it("escapes HTML in report values", () => {
    const injected = {
      ...sampleReport,
      outputMetadata: { ...sampleReport.outputMetadata, title: "<script>alert(1)</script>" },
    };
    const { content } = renderReportContent(injected, "html");
    expect(content).not.toContain("<script>alert(1)</script>");
    expect(content).toContain("&lt;script&gt;");
  });
});

describe("renderAllFormats", () => {
  it("returns one result per supported format", () => {
    const results = renderAllFormats(sampleReport);
    expect(results.map((r) => r.format)).toEqual(["json", "markdown", "html"]);
  });
});

describe("registry", () => {
  it("falls back to the generic template for unknown names", () => {
    const registry = createDefaultRegistry();
    const unknown = { ...sampleReport, template: "does-not-exist" };
    expect(() => renderReportContent(unknown, "markdown", registry)).not.toThrow();
  });

  it("throws when no template and no generic fallback exist", () => {
    const empty = new ReportTemplateRegistry();
    expect(() => renderReportContent(sampleReport, "markdown", empty)).toThrow(/generic/);
  });
});

describe("writeReport", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "kittie-reports-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes each format and returns the output path", async () => {
    for (const format of FORMATS) {
      const result = await writeReport(sampleReport, format, dir);
      expect(result.outputPath).toBe(join(dir, reportFileName(sampleReport.reportId, format)));
      const onDisk = readFileSync(result.outputPath!, "utf8");
      expect(onDisk).toBe(result.content);
    }
  });

  it("creates missing parent directories", async () => {
    const nested = join(dir, "a", "b", "c");
    const result = await writeReport(sampleReport, "json", nested);
    expect(readFileSync(result.outputPath!, "utf8").length).toBeGreaterThan(0);
  });
});
