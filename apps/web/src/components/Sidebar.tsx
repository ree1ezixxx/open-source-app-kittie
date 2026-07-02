import { useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { FreshnessFooter } from "./FreshnessFooter";
import {
  IconStar,
  IconGrid,
  IconMessage,
  IconSparkles,
  IconKey,
  IconTerminal,
  IconBook,
  IconSettings,
  IconChevron,
} from "../icons";

type Item = { to: string; label: string; icon: typeof IconGrid; badge?: "total" };
type Group = { label: string; items: Item[]; collapsible?: boolean };

// Engine-first IA (#194, #179): the primary nav is the intelligence product —
// Ask (front door), Reports, App Intelligence — plus Developers (MCP / API).
// The many appkittie-clone dashboards are NOT deleted; they move under a
// collapsed "Dashboards (legacy)" group so every route stays reachable while the
// new surfaces prove coverage. Nothing here removes a route or a page.
export const PRIMARY: Group[] = [
  {
    label: "Intelligence",
    items: [
      { to: "/ask", label: "Ask", icon: IconMessage },
      { to: "/reports", label: "Reports", icon: IconGrid },
      { to: "/intelligence", label: "App Intelligence", icon: IconSparkles },
    ],
  },
];

export const DEVELOPERS: Group = {
  label: "Developers",
  items: [
    { to: "/mcp", label: "MCP", icon: IconTerminal },
    { to: "/docs", label: "API Docs", icon: IconBook },
    { to: "/settings/api-keys", label: "API Keys", icon: IconKey },
  ],
};

// The retired appkittie dashboards (Explore/Ads/Organic/…) were deleted in
// #239 — no legacy nav group remains. A couple of retained surfaces (Pulse,
// App Engine, Builder) stay reachable by URL but are intentionally not in-nav.

export const FOOT_ITEM: Item = { to: "/settings", label: "Settings", icon: IconSettings };

/** Every destination the sidebar links to — the primary IA plus Developers and
 *  the Settings foot. */
export const SIDEBAR_LINKS: string[] = [
  ...PRIMARY.flatMap((g) => g.items),
  ...DEVELOPERS.items,
  FOOT_ITEM,
].map((it) => it.to);

const NAV_OPEN_KEY = "kittie-nav-open";

export function Sidebar({ total = 0 }: { total?: number }) {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(NAV_OPEN_KEY) || "{}");
    } catch {
      return {};
    }
  });

  const toggle = (label: string) =>
    setOpen((o) => {
      const next = { ...o, [label]: !(o[label] ?? false) };
      localStorage.setItem(NAV_OPEN_KEY, JSON.stringify(next));
      return next;
    });

  // The group containing the active route is always shown, even if collapsed,
  // so the current page is never hidden behind a closed section.
  const hasActive = (g: Group) => g.items.some((it) => pathname.startsWith(it.to));

  const renderItem = (it: Item) => {
    const Icon = it.icon;
    return (
      <NavLink
        key={it.to}
        to={it.to}
        className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
        end={it.to === "/settings"}
      >
        <Icon />
        <span>{it.label}</span>
        {it.badge === "total" && total > 0 && (
          <span className="nav-count">{total.toLocaleString()}</span>
        )}
      </NavLink>
    );
  };

  const renderGroup = (g: Group) => {
    if (!g.collapsible) {
      return (
        <nav className="nav-group" key={g.label}>
          <div className="nav-label">{g.label}</div>
          {g.items.map(renderItem)}
        </nav>
      );
    }
    const expanded = (open[g.label] ?? false) || hasActive(g);
    return (
      <nav className="nav-group" key={g.label}>
        <button
          type="button"
          className="nav-label nav-label-toggle"
          aria-expanded={expanded}
          onClick={() => toggle(g.label)}
        >
          <span>{g.label}</span>
          <IconChevron className="nav-chev" />
        </button>
        {expanded && g.items.map(renderItem)}
      </nav>
    );
  };

  return (
    <aside className="sidebar">
      <button
        className="brand"
        onClick={() => nav("/ask")}
        style={{ border: "none", background: "none", cursor: "pointer", width: "100%" }}
      >
        <div className="brand-mark">
          <IconStar style={{ width: 17, height: 17 }} />
        </div>
        <div style={{ textAlign: "left" }}>
          <div className="brand-name">Kittie</div>
          <div className="brand-sub">App intelligence</div>
        </div>
      </button>

      {PRIMARY.map(renderGroup)}
      {renderGroup(DEVELOPERS)}

      <div className="sidebar-foot">
        {renderItem(FOOT_ITEM)}
        <FreshnessFooter />
      </div>
    </aside>
  );
}
