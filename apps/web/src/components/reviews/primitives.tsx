/* ============================================================
   Lane D — local UI primitives.

   Lane A owns the canonical Tabs / EmptyState in the shared shell.
   These are deliberately self-contained so this lane is verifiable
   *before* the shell lands; on rebase onto feat/ui, swap imports to
   the shared components and delete this file.
   ============================================================ */
import type { ReactNode } from "react";
import { IconInfo } from "../../icons";
import "../../styles/reviews.css";

/* ---- Page header (matches index.css .topbar tokens) ---- */
export function PageHeader({
  icon,
  title,
  subtitle,
  actions,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="topbar">
      <div className="topbar-row">
        <div className="page-title-wrap">
          <div className="page-icon">{icon}</div>
          <div>
            <div className="page-title">{title}</div>
            {subtitle && <div className="page-sub">{subtitle}</div>}
          </div>
        </div>
        <div className="topbar-spacer" />
        {actions}
      </div>
    </div>
  );
}

/* ---- Tabs (controlled) ---- */
export interface TabDef {
  id: string;
  label: string;
  icon?: ReactNode;
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="rv-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          className={`rv-tab ${active === t.id ? "on" : ""}`}
          onClick={() => onChange(t.id)}
        >
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ---- Empty state (honest, no fabricated content) ---- */
export function EmptyState({
  icon,
  title,
  sub,
  action,
}: {
  icon?: ReactNode;
  title: string;
  sub?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rv-empty">
      <div className="rv-empty-icon">{icon ?? <IconInfo />}</div>
      <div className="rv-empty-title">{title}</div>
      {sub && <div className="rv-empty-sub">{sub}</div>}
      {action && <div className="rv-empty-action">{action}</div>}
    </div>
  );
}

/* ---- Mock badge — load-bearing honesty label ---- */
export function MockBadge({ children = "Preview · mocked" }: { children?: ReactNode }) {
  return (
    <span className="rv-mock-badge" title="Not computed from live data yet — sample shape only">
      {children}
    </span>
  );
}

/* ---- Inline "not built yet" banner for whole mocked panels ---- */
export function MockNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rv-mock-notice">
      <IconInfo />
      <span>{children}</span>
    </div>
  );
}
