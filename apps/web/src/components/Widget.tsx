import type { ReactNode } from "react";

/** Dashboard card with a header + optional action (Highlights: New Big Hits / Top Gainers …). */
export function Widget({
  title,
  count,
  action,
  children,
}: {
  title: string;
  /** Optional "(N)" result count shown after the title (New Big Hits only in truth). */
  count?: number | null;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="widget">
      <header className="widget-head">
        <h3 className="widget-title">
          {title}
          {count != null && (
            <span className="widget-count" style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>
              {" "}({count.toLocaleString()})
            </span>
          )}
        </h3>
        {action}
      </header>
      <div className="widget-body">{children}</div>
    </section>
  );
}
