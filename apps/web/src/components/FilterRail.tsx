import type { ReactNode } from "react";

/** Left filter sidebar shell (Explore, Hot Ideas, Rising). Compose with FilterSection. */
export function FilterRail({
  title = "Filters",
  count,
  actions,
  children,
}: {
  title?: string;
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <aside className="filter-rail">
      <div className="filter-rail-head">
        <span className="filter-rail-title">
          {title}
          {typeof count === "number" && count > 0 && <span className="filter-rail-count">{count}</span>}
        </span>
        {actions}
      </div>
      <div className="filter-rail-body">{children}</div>
    </aside>
  );
}

export function FilterSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="filter-section">
      <div className="filter-label">{label}</div>
      {children}
    </div>
  );
}
