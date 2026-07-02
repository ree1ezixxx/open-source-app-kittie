/**
 * Report renderer entry points.
 *
 * `renderReportContent` is pure and BROWSER-SAFE — it resolves the template,
 * builds the document, and serialises to the requested format, returning content
 * + metadata (no I/O, no Node globals). Filesystem persistence (`writeReport`)
 * lives in `fs.ts` so this module can be bundled for the web via the package's
 * `./browser` entry. There is no DB-backed report history in v1.
 */
import type { IntelligenceReportContract, ReportFormat } from "@kittie/types";
import { createDefaultRegistry, ReportTemplateRegistry } from "./registry.js";
import { renderHtml } from "./renderers/html.js";
import { renderJson } from "./renderers/json.js";
import { renderMarkdown } from "./renderers/markdown.js";

export const FORMAT_META: Record<ReportFormat, { extension: string; contentType: string }> = {
  json: { extension: "json", contentType: "application/json" },
  markdown: { extension: "md", contentType: "text/markdown" },
  html: { extension: "html", contentType: "text/html" },
};

/** UTF-8 byte length without Node's `Buffer` (works in the browser too). */
function utf8ByteLength(content: string): number {
  return new TextEncoder().encode(content).length;
}

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
    byteLength: utf8ByteLength(content),
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
