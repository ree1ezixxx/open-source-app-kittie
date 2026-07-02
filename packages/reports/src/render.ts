/**
 * Report renderer entry points.
 *
 * `renderReportContent` is pure — it resolves the template, builds the document,
 * and serialises to the requested format, returning content + metadata (no I/O).
 * `writeReport` additionally persists to the local filesystem and returns the
 * output path. There is no DB-backed report history in v1.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { IntelligenceReportContract, ReportFormat } from "@kittie/types";
import { createDefaultRegistry, ReportTemplateRegistry } from "./registry.js";
import { renderHtml } from "./renderers/html.js";
import { renderJson } from "./renderers/json.js";
import { renderMarkdown } from "./renderers/markdown.js";

const FORMAT_META: Record<ReportFormat, { extension: string; contentType: string }> = {
  json: { extension: "json", contentType: "application/json" },
  markdown: { extension: "md", contentType: "text/markdown" },
  html: { extension: "html", contentType: "text/html" },
};

const ALL_FORMATS: ReportFormat[] = ["json", "markdown", "html"];

export interface RenderResult {
  reportId: string;
  template: string;
  format: ReportFormat;
  contentType: string;
  content: string;
  byteLength: number;
  /** Set only when the report was written to disk; `null` for content-only renders. */
  outputPath: string | null;
  metadata: {
    title: string;
    generatedAt: string | null;
    expiresAt: string | null;
  };
}

function resolveRegistry(registry?: ReportTemplateRegistry): ReportTemplateRegistry {
  return registry ?? createDefaultRegistry();
}

function serialise(
  contract: IntelligenceReportContract,
  format: ReportFormat,
  registry: ReportTemplateRegistry,
): string {
  const document = registry.resolve(contract.template)(contract);
  switch (format) {
    case "json":
      return renderJson(document, contract);
    case "markdown":
      return renderMarkdown(document, contract);
    case "html":
      return renderHtml(document, contract);
  }
}

/** Render a report to a single format in memory. Pure — no filesystem access. */
export function renderReportContent(
  contract: IntelligenceReportContract,
  format: ReportFormat,
  registry?: ReportTemplateRegistry,
): RenderResult {
  const content = serialise(contract, format, resolveRegistry(registry));
  return {
    reportId: contract.reportId,
    template: contract.template,
    format,
    contentType: FORMAT_META[format].contentType,
    content,
    byteLength: Buffer.byteLength(content, "utf8"),
    outputPath: null,
    metadata: {
      title: contract.outputMetadata.title,
      generatedAt: contract.outputMetadata.generatedAt,
      expiresAt: contract.outputMetadata.expiresAt,
    },
  };
}

/** Render one contract to every supported format in memory. */
export function renderAllFormats(
  contract: IntelligenceReportContract,
  registry?: ReportTemplateRegistry,
): RenderResult[] {
  const shared = resolveRegistry(registry);
  return ALL_FORMATS.map((format) => renderReportContent(contract, format, shared));
}

export function reportFileName(reportId: string, format: ReportFormat): string {
  return `${reportId}.${FORMAT_META[format].extension}`;
}

/**
 * Render and write a report to `outDir`. Returns the result with `outputPath`
 * populated. The directory (and any parents) is created if missing.
 */
export async function writeReport(
  contract: IntelligenceReportContract,
  format: ReportFormat,
  outDir: string,
  registry?: ReportTemplateRegistry,
): Promise<RenderResult> {
  const result = renderReportContent(contract, format, registry);
  const outputPath = join(outDir, reportFileName(contract.reportId, format));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.content, "utf8");
  return { ...result, outputPath };
}
