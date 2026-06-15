import type { ReactNode } from "react";

/** Shared empty/zero-state. Used across every surface that can have no data. */
export function EmptyState({
  icon,
  title,
  sub,
  action,
}: {
  icon?: ReactNode;
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="center-state">
      {icon}
      <div className="title">{title}</div>
      {sub && <div className="sub">{sub}</div>}
      {action}
    </div>
  );
}
