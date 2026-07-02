import { useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { FreshnessFooter } from "./FreshnessFooter";
import {
  IconDatabase,
  IconSpark,
  IconTrending,
  IconRising,
  IconStar,
  IconGrid,
  IconSearch,
  IconImage,
  IconVideo,
  IconGlobe,
  IconMessage,
  IconBulb,
  IconSparkles,
  IconKey,
  IconTerminal,
  IconBook,
  IconCoin,
  IconSettings,
  IconChevron,
} from "../icons";

type Item = { to: string; label: string; icon: typeof IconDatabase; badge?: "total" };
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

// Legacy appkittie dashboards — kept reachable (collapsed by default), not
// removed. The group auto-expands when one of its routes is active.
export const LEGACY: Group = {
  label: "Dashboards (legacy)",
  collapsible: true,
  items: [
    { to: "/dashboard/pulse", label: "Pulse", icon: IconTrending },
    { to: "/dashboard/explore", label: "Apps", icon: IconDatabase, badge: "total" },
    { to: "/dashboard/ads", label: "Ads", icon: IconImage },
    { to: "/dashboard/organic", label: "Organic", icon: IconVideo },
    { to: "/dashboard/highlights", label: "Highlights", icon: IconSpark },
    { to: "/dashboard/trending", label: "Trending", icon: IconTrending },
    { to: "/dashboard/rising", label: "Rising", icon: IconRising },
    { to: "/dashboard/favorites", label: "Favorites", icon: IconStar },
    { to: "/dashboard/aso/apps", label: "App Tracking", icon: IconGrid },
    { to: "/dashboard/aso/keywords", label: "Keyword Explorer", icon: IconSearch },
    { to: "/dashboard/aso/screenshots", label: "Screenshots", icon: IconImage },
    { to: "/dashboard/aso/screenshot-translation", label: "Translations", icon: IconGlobe },
    { to: "/dashboard/reviews", label: "Reviews", icon: IconMessage },
    { to: "/dashboard/hot-ideas", label: "Hot ideas", icon: IconBulb },
    { to: "/tools/pricing-calculator", label: "Pricing Calculator", icon: IconCoin },
  ],
};

export const FOOT_ITEM: Item = { to: "/settings", label: "Settings", icon: IconSettings };

/** Every destination the sidebar links to — the primary IA plus Developers,
 *  the legacy dashboards group, and the Settings foot. */
export const SIDEBAR_LINKS: string[] = [
  ...PRIMARY.flatMap((g) => g.items),
  ...DEVELOPERS.items,
  ...LEGACY.items,
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
      {renderGroup(LEGACY)}

      <div className="sidebar-foot">
        {renderItem(FOOT_ITEM)}
        <FreshnessFooter />
      </div>
    </aside>
  );
}
