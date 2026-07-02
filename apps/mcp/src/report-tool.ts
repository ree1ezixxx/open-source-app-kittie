/**
 * `generate_report` rendering bridge. There is no report-generation API, so the
 * MCP renders in-process with `@kittie/reports` — its intended local-first path
 * (#187). The source *intelligence* still comes from the API (fetched in
 * index.ts); this module only turns a fetched envelope into a rendered report.
 */
import {
  buildAppTeardownReport,
  buildBuildBriefReport,
  buildCategoryPulseReport,
  createReportRegistry,
  renderReportContent,
  type TrendsIntelligenceResponse,
} from "@kittie/reports";
import type {
  AppDetailIntelligenceResponse,
  ValidateIdeaIntelligenceResponse,
} from "@kittie/types";
import type { ReportRenderFormat, ReportTemplateName } from "./intelligence-tools.js";

const registry = createReportRegistry();

export interface GeneratedReport {
  reportId: string;
  template: string;
  format: string;
  contentType: string;
  byteLength: number;
  title: string;
  generatedAt: string | null;
  content: string;
}

export function renderReport(
  template: ReportTemplateName,
  envelope: unknown,
  format: ReportRenderFormat,
): GeneratedReport {
  const contract =
    template === "app_teardown"
      ? buildAppTeardownReport(envelope as AppDetailIntelligenceResponse)
      : template === "category_pulse"
        ? buildCategoryPulseReport(envelope as TrendsIntelligenceResponse)
        : buildBuildBriefReport(envelope as ValidateIdeaIntelligenceResponse);

  const result = renderReportContent(contract, format, registry);
  return {
    reportId: result.reportId,
    template: result.template,
    format: result.format,
    contentType: result.contentType,
    byteLength: result.byteLength,
    title: result.metadata.title,
    generatedAt: result.metadata.generatedAt,
    content: result.content,
  };
}
