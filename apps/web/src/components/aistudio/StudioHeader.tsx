import type { ReactNode } from "react";

/** Lane-local page header matching the shell's .topbar look (icon + title + actions). */
export function StudioHeader({
  icon,
  title,
  subtitle,
  count,
  actions,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  count?: number;
  actions?: ReactNode;
}) {
  return (
    <div className="topbar">
      <div className="topbar-row">
        <div className="page-title-wrap">
          <div className="page-icon">{icon}</div>
          <div>
            <div className="page-title">{title}</div>
            <div className="page-sub">{subtitle}</div>
          </div>
          {count !== undefined && <span className="count-chip">{count.toLocaleString()}</span>}
        </div>
        <div className="topbar-spacer" />
        {actions && <div className="studio-actions">{actions}</div>}
      </div>
    </div>
  );
}
