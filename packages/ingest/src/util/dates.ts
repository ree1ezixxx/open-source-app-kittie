export function todaySnapshotDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseAppleDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Parse a store *release* date, rejecting dates in the future.
 *
 * Apple (iTunes) and Google can list a future `releaseDate` for pre-orders and
 * unreleased apps. Stored unguarded, those future dates poison the "released
 * within N days" window that powers the New Big Hits highlights widget, so we
 * treat any future date as unknown (`null`) rather than persisting it.
 *
 * Pure and time-injectable: pass `now` in tests; defaults to the current time.
 */
export function clampReleaseDate(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): Date | null {
  if (value == null || value === "") return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getTime() > now.getTime()) return null;
  return parsed;
}
