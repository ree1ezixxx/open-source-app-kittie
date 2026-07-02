/**
 * Format-agnostic report document.
 *
 * A template turns an {@link IntelligenceReportContract} into a `ReportDocument`
 * — an ordered, structured body with no formatting decisions baked in. The
 * per-format renderers (JSON, Markdown, HTML) serialise the same document, so
 * every format shows the same content and no format can silently drift.
 */

export interface ReportKeyValue {
  label: string;
  value: string;
}

export type ReportBlock =
  | { kind: "text"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "keyValue"; entries: ReportKeyValue[] };

export interface ReportSection {
  heading: string;
  blocks: ReportBlock[];
}

export interface ReportDocument {
  title: string;
  /** One-line lede shown under the title. `null` when the template omits it. */
  summary: string | null;
  sections: ReportSection[];
}
