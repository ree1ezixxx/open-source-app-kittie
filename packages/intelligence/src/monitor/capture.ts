/**
 * Change-capture engine for the Monitor layer.
 *
 * Diffs two captures of a Tracked app's watched fields and emits the
 * append-only field deltas persisted as App changes (`app_changes`).
 * An undefined field means "not observed this run" and is skipped — a
 * failed fetch must never masquerade as null — while null means
 * "observed absent" and participates in real transitions (e.g.
 * chartRank null→34 = entered chart; price null→3.99 = became paid).
 */

/** Listing and market fields watched for App changes on a Tracked app. */
export type WatchedFields = {
  title: string | null;
  description: string | null;
  price: number | null;
  category: string | null;
  contentRating: string | null;
  screenshotUrls: string[];
  rating: number | null;
  reviewCount: number | null;
  chartRank: number | null;
  revenueEstimate: number | null;
  downloadsEstimate: number | null;
};

/** One observation run of a Tracked app; unobserved fields stay undefined. */
export type Capture = {
  capturedAt: Date;
  fields: Partial<WatchedFields>;
};

/** snake_case storage names for the `app_changes.field` column. */
export type ChangeField =
  | "title"
  | "description"
  | "price"
  | "category"
  | "content_rating"
  | "screenshot_urls"
  | "rating"
  | "review_count"
  | "chart_rank"
  | "revenue_estimate"
  | "downloads_estimate";

/** A single recorded App change, shaped for an `app_changes` row. */
export type FieldChange = {
  field: ChangeField;
  oldValue: string | null;
  newValue: string | null;
  priorAt: Date;
  capturedAt: Date;
};

type TextField = "title" | "description" | "category" | "contentRating";
type NumericField =
  | "price"
  | "rating"
  | "reviewCount"
  | "chartRank"
  | "revenueEstimate"
  | "downloadsEstimate";

const TEXT_FIELDS: readonly TextField[] = [
  "title",
  "description",
  "category",
  "contentRating",
];

const NUMERIC_FIELDS: readonly NumericField[] = [
  "price",
  "rating",
  "reviewCount",
  "chartRank",
  "revenueEstimate",
  "downloadsEstimate",
];

const COLUMN: Record<keyof WatchedFields, ChangeField> = {
  title: "title",
  description: "description",
  price: "price",
  category: "category",
  contentRating: "content_rating",
  screenshotUrls: "screenshot_urls",
  rating: "rating",
  reviewCount: "review_count",
  chartRank: "chart_rank",
  revenueEstimate: "revenue_estimate",
  downloadsEstimate: "downloads_estimate",
};

/** Store rounding jitter on ratings must not record as an App change. */
const RATING_EPSILON = 0.005;

function numbersEqual(field: NumericField, prior: number, fresh: number): boolean {
  if (field === "rating") return Math.abs(prior - fresh) <= RATING_EPSILON;
  return prior === fresh;
}

/**
 * Review count is cumulative — a strict decrease is collection noise,
 * never a real App change. Drop it silently.
 */
function isImpossibleDelta(field: NumericField, prior: number, fresh: number): boolean {
  return field === "reviewCount" && fresh < prior;
}

function sameUrlSet(prior: string[], fresh: string[]): boolean {
  const priorSet = new Set(prior);
  const freshSet = new Set(fresh);
  if (priorSet.size !== freshSet.size) return false;
  for (const url of priorSet) {
    if (!freshSet.has(url)) return false;
  }
  return true;
}

/**
 * Produce the append-only field deltas between two captures. Fields
 * undefined on either side are skipped entirely; null↔value transitions
 * on observed fields are recorded.
 */
export function captureChanges(prior: Capture, fresh: Capture): FieldChange[] {
  const changes: FieldChange[] = [];
  const push = (
    field: ChangeField,
    oldValue: string | null,
    newValue: string | null,
  ): void => {
    changes.push({
      field,
      oldValue,
      newValue,
      priorAt: prior.capturedAt,
      capturedAt: fresh.capturedAt,
    });
  };

  for (const key of TEXT_FIELDS) {
    const oldValue = prior.fields[key];
    const newValue = fresh.fields[key];
    if (oldValue === undefined || newValue === undefined) continue;
    if (oldValue === newValue) continue;
    push(COLUMN[key], oldValue, newValue);
  }

  for (const key of NUMERIC_FIELDS) {
    const oldValue = prior.fields[key];
    const newValue = fresh.fields[key];
    if (oldValue === undefined || newValue === undefined) continue;
    if (oldValue === null && newValue === null) continue;
    if (oldValue !== null && newValue !== null) {
      if (isImpossibleDelta(key, oldValue, newValue)) continue;
      if (numbersEqual(key, oldValue, newValue)) continue;
    }
    push(
      COLUMN[key],
      oldValue === null ? null : String(oldValue),
      newValue === null ? null : String(newValue),
    );
  }

  const oldUrls = prior.fields.screenshotUrls;
  const newUrls = fresh.fields.screenshotUrls;
  if (oldUrls !== undefined && newUrls !== undefined && !sameUrlSet(oldUrls, newUrls)) {
    push(COLUMN.screenshotUrls, JSON.stringify(oldUrls), JSON.stringify(newUrls));
  }

  return changes;
}
