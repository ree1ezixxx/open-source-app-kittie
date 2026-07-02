/**
 * @kittie/reports — local-first report renderer foundation.
 *
 * Renders an {@link IntelligenceReportContract} to HTML, Markdown, and JSON.
 * Templates are pluggable via {@link ReportTemplateRegistry}; a `generic`
 * template ships built in. No DB-backed report history in v1.
 */
export type {
  ReportBlock,
  ReportDocument,
  ReportKeyValue,
  ReportSection,
} from "./document.js";
export {
  createDefaultRegistry,
  genericTemplate,
  GENERIC_TEMPLATE,
  ReportTemplateRegistry,
  type ReportTemplate,
} from "./registry.js";
export {
  renderAllFormats,
  renderReportContent,
  reportFileName,
  writeReport,
  type RenderResult,
} from "./render.js";
export { renderHtml } from "./renderers/html.js";
export { renderJson, type RenderedReportJson } from "./renderers/json.js";
export { renderMarkdown } from "./renderers/markdown.js";
export {
  formatCaveatLine,
  formatConfidence,
  formatEvidenceLine,
} from "./renderers/shared.js";
export {
  sampleReport,
  SAMPLE_CONTRACT_VERSION,
  type SampleReportOutput,
} from "./fixtures.js";
export {
  APP_TEARDOWN_TEMPLATE,
  appTeardownTemplate,
  buildAppTeardownReport,
  CATEGORY_PULSE_TEMPLATE,
  categoryPulseTemplate,
  buildCategoryPulseReport,
  createReportRegistry,
  type AppTeardownMetric,
  type AppTeardownListingMedia,
  type AppTeardownOutput,
  type BuildAppTeardownOptions,
  type CategoryPulseMovementRow,
  type CategoryPulseOpportunity,
  type CategoryPulseOutput,
  type BuildCategoryPulseOptions,
  type TrendsIntelligenceResponse,
  BUILD_BRIEF_TEMPLATE,
  buildBriefTemplate,
  buildBuildBriefReport,
  type BuildBriefCompetitor,
  type BuildBriefOutput,
  type BuildBriefOptions,
} from "./templates/index.js";
