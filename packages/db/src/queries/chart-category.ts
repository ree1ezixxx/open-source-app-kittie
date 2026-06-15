import type { ChartType } from "@kittie/types";

/**
 * The single source of truth for the packed `app_snapshots.chart_category`
 * value ↔ `{ type, genre }`.
 *
 * A chart is identified by a {@link ChartType} (`free | paid | grossing`) and an
 * optional App Store genre. The packed form is `top-<type>` for the overall
 * chart and `top-<type>:<genre>` for a per-genre chart, e.g.:
 *
 *   { type: "free",     genre: null }       ↔ "top-free"
 *   { type: "paid",     genre: "Business" } ↔ "top-paid:Business"
 *   { type: "grossing", genre: "Games" }    ↔ "top-grossing:Games"
 *
 * Both the Apple chart ingest (which builds the strings) and the ranking
 * assembly (which reads them back) route through this codec so they can never
 * disagree on the encoding.
 *
 * Decoding is tolerant of the historical drift in this column: older ingest
 * generations stored the raw Apple feed ids (`topfreeapplications`,
 * `topgrossingapplications`) rather than the `top-<type>` slug. Those legacy
 * forms still decode to the correct {@link ChartType} (with a null genre, since
 * the legacy feed id carried no genre in the string), while encoding always
 * emits the canonical slug form.
 */

/** A decoded chart identity. `genre` is null for the overall (no-genre) chart. */
export interface ChartCategory {
  type: ChartType;
  genre: string | null;
}

const TYPE_SLUG: Record<ChartType, string> = {
  free: "top-free",
  paid: "top-paid",
  grossing: "top-grossing",
};

/** Collapse any historical `chart_category` encoding to a canonical chart type. */
export function normalizeChartType(raw: string | null): ChartType | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  // Order matters: "grossing" is the most specific; "free"/"paid" never co-occur.
  if (v.includes("grossing")) return "grossing";
  if (v.includes("paid")) return "paid";
  if (v.includes("free")) return "free";
  return null;
}

/** Pack a `{ type, genre }` chart identity into a `chart_category` string. */
export function encodeChartCategory({ type, genre }: ChartCategory): string {
  const slug = TYPE_SLUG[type];
  return genre ? `${slug}:${genre}` : slug;
}

/**
 * Unpack a `chart_category` string into `{ type, genre }`.
 *
 * Returns null when the type cannot be determined (an unknown/empty encoding),
 * so callers can drop rows that predate any recognized chart shape. The genre
 * is the substring after the first `:`; absent for the overall chart and for
 * legacy raw feed ids that never embedded a genre.
 */
export function decodeChartCategory(raw: string | null): ChartCategory | null {
  const type = normalizeChartType(raw);
  if (type === null) return null;
  const colon = raw!.indexOf(":");
  const genre = colon === -1 ? null : raw!.slice(colon + 1) || null;
  return { type, genre };
}
