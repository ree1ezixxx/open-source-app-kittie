/** Trim a trailing ".0" so 1.0 → "1" (truth shows "1M", never "1.0M"). */
function trimZero(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

export function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${trimZero((n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1))}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  if (n >= 100) return `$${Math.round(n)}`;
  // Truth floors any sub-100 MRR (incl. $0) to the literal "$<100".
  return "$<100";
}

export function formatCompact(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${trimZero((n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1))}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return `${Math.round(n)}`;
}

export function formatRating(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toFixed(2);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
