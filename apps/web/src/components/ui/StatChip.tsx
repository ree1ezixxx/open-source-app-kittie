/** Compact metric badge — registry-style stat chip (Watermelon Badge pattern). */
export function StatChip({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "accent" | "positive" | "negative";
}) {
  return (
    <div className={`stat-chip stat-chip--${tone}`}>
      <span className="stat-chip-label">{label}</span>
      <span className="stat-chip-value">{value}</span>
    </div>
  );
}
