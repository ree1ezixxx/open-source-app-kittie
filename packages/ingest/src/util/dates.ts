export function todaySnapshotDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Tolerate a same-day or timezone-skewed release/update instant. Apple returns
 * a full timestamp (e.g. released today at 15:00Z); a sweep running earlier the
 * same day must not drop it as "future". Genuine pre-orders are days/months out,
 * well beyond this window.
 */
const FUTURE_GRACE_MS = 48 * 60 * 60 * 1000;

/**
 * Parse a store date (release date or last-updated), rejecting implausible
 * **future** dates.
 *
 * Apple (iTunes) and Google can list a future `releaseDate` / version date for
 * pre-orders and unreleased listings. Stored unguarded, those poison the
 * "released within N days" window behind New Big Hits and the Explore
 * "Last-Update" sort, so we treat a genuinely-future date as unknown (`null`).
 * A short grace window keeps legitimately same-day / timezone-skewed instants.
 *
 * Accepts an ISO string, a Unix-ms number (Google's `updated`), or a Date.
 * Pure and time-injectable: pass `now` in tests; defaults to the current time.
 */
export function clampStoreDate(
  value: string | number | Date | null | undefined,
  now: Date = new Date(),
): Date | null {
  if (value == null || value === "") return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getTime() > now.getTime() + FUTURE_GRACE_MS) return null;
  return parsed;
}
