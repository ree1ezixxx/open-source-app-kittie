import type { ReactNode } from "react";
import { IconMoon, IconSun } from "../icons";
import type { Theme } from "../lib/theme";

/**
 * Standard page chrome: sticky topbar (icon + title + sub + count + actions + theme toggle)
 * over a scrolling body. Every non-table page uses this so the shell stays consistent.
 */
export function PageShell({
  icon,
  title,
  sub,
  count,
  actions,
  toolbar,
  theme,
  onToggleTheme,
  bodyClass,
  children,
}: {
  icon?: ReactNode;
  title: string;
  sub?: string;
  count?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  theme: Theme;
  onToggleTheme: () => void;
  bodyClass?: string;
  children: ReactNode;
}) {
  return (
    <main className="main">
      <header className="topbar">
        <div className="topbar-row">
          <div className="page-title-wrap">
            {icon && <div className="page-icon">{icon}</div>}
            <div>
              <div className="page-title">{title}</div>
              {sub && <div className="page-sub">{sub}</div>}
            </div>
          </div>
          {count}
          <div className="topbar-spacer" />
          {actions}
          <button className="icon-btn" onClick={onToggleTheme} title="Toggle theme">
            {theme === "dark" ? <IconSun /> : <IconMoon />}
          </button>
        </div>
        {toolbar}
      </header>
      <div className={`page-body ${bodyClass || ""}`}>{children}</div>
    </main>
  );
}
