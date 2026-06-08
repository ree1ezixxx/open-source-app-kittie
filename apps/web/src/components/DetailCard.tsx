import type { ReactNode } from "react";

/** Card wrapper for a detail-page section. Everything lives in a card — no loose text. */
export function DetailCard({
  title,
  count,
  action,
  children,
  className = "",
}: {
  title?: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`dcard ${className}`}>
      {(title || action) && (
        <div className="dcard-head">
          {title && (
            <h2 className="dcard-title">
              {title}
              {count != null && <span className="dcard-count">{count.toLocaleString()}</span>}
            </h2>
          )}
          {action}
        </div>
      )}
      <div className="dcard-body">{children}</div>
    </section>
  );
}

/** Empty-state body for a section whose data we don't ingest yet. */
export function EmptyCard({
  icon,
  title,
  sub,
}: {
  icon: ReactNode;
  title: string;
  sub?: string;
}) {
  return (
    <div className="dcard-empty">
      {icon}
      <div className="t">{title}</div>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}

/** A single labelled fact inside the quick-facts grid (componentised, never loose text). */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact">
      <div className="fact-label">{label}</div>
      <div className="fact-value">{children}</div>
    </div>
  );
}
