/**
 * @kittie/reports — local-first report renderer foundation.
 *
 * Renders an {@link IntelligenceReportContract} to HTML, Markdown, and JSON.
 * Templates are pluggable via {@link ReportTemplateRegistry}; a `generic`
 * template ships built in. No DB-backed report history in v1.
 *
 * The pure render surface lives in `./browser` (browser-safe); this entry adds
 * `writeReport` (Node filesystem). Web consumers import `@kittie/reports/browser`.
 */
export * from "./browser.js";
export { writeReport } from "./fs.js";
