export function todaySnapshotDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseAppleDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
