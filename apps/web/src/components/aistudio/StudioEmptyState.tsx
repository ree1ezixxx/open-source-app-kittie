import type { ReactNode } from "react";

/** Lane-local empty state (distinct from the shell's EmptyState stub). */
export function StudioEmptyState({
  icon,
  title,
  sub,
  action,
  bare = false,
}: {
  icon?: ReactNode;
  title: string;
  sub?: string;
  action?: ReactNode;
  bare?: boolean;
}) {
  return (
    <div className={`studio-empty${bare ? " bare" : ""}`}>
      {icon && <div className="ico">{icon}</div>}
      <div className="t">{title}</div>
      {sub && <div className="s">{sub}</div>}
      {action}
    </div>
  );
}
