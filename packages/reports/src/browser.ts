/**
 * @kittie/reports/browser — the browser-safe surface (no Node `fs`/`path`).
 *
 * Everything here is pure and bundleable for the web: the render pipeline,
 * registry, and all template builders. The main `@kittie/reports` entry
 * re-exports this plus `writeReport` (filesystem, Node-only).
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
  FORMAT_META,
  renderAllFormats,
  renderReportContent,
  reportFileName,
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
  type BuildBriefFinding,
  type BuildBriefCompetitor,
  type BuildBriefOutput,
  type BuildBriefOptions,
} from "./templates/index.js";
