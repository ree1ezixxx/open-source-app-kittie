import { useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { FreshnessFooter } from "./FreshnessFooter";
import {
  IconDatabase,
  IconSpark,
  IconTrending,
  IconRising,
  IconStar,
  IconDownload,
  IconSparkles,
  IconGrid,
  IconSearch,
  IconImage,
  IconGlobe,
  IconMessage,
  IconBulb,
  IconKey,
  IconTerminal,
  IconBook,
  IconCoin,
  IconSettings,
  IconChevron,
} from "../icons";

type Item = { to: string; label: string; icon: typeof IconDatabase; badge?: "total" };
type Group = { label: string; items: Item[]; collapsible?: boolean };

// Information architecture organised by the user's JOB, not the feature list.
// Trending / Rising / Highlights are sorted views of the same app database, so
// they sit together under Discover. Low-frequency clusters (Studio, Developers)
// are collapsible and collapsed by default to keep the default surface calm.
const PRIMARY: Group[] = [
  {
    label: "Discover",
    items: [
      { to: "/dashboard/explore", label: "Apps", icon: IconDatabase, badge: "total" },
      { to: "/dashboard/highlights", label: "Highlights", icon: IconSpark },
      { to: "/dashboard/trending", label: "Trending", icon: IconTrending },
      { to: "/dashboard/rising", label: "Rising", icon: IconRising },
    ],
  },
  {
    label: "Research",
    items: [
      { to: "/dashboard/ads", label: "Ads Library", icon: IconImage },
      { to: "/dashboard/reviews", label: "Reviews", icon: IconMessage },
      { to: "/dashboard/aso/keywords", label: "Keyword Explorer", icon: IconSearch },
    ],
  },
  {
    label: "Watchlist",
    items: [
      { to: "/dashboard/favorites", label: "Favorites", icon: IconStar },
      { to: "/dashboard/aso/apps", label: "App Tracking", icon: IconGrid },
    ],
  },
  {
    label: "Studio",
    collapsible: true,
    items: [
      { to: "/dashboard/hot-ideas", label: "Hot Ideas", icon: IconBulb },
      { to: "/dashboard/builder", label: "Builder", icon: IconSparkles },
      { to: "/dashboard/app-engine", label: "App Engine", icon: IconDownload },
      { to: "/dashboard/aso/screenshots", label: "Screenshots", icon: IconImage },
      { to: "/dashboard/aso/screenshot-translation", label: "Translations", icon: IconGlobe },
      { to: "/tools/pricing-calculator", label: "Pricing Calculator", icon: IconCoin },
    ],
  },
];

const DEVELOPERS: Group = {
  label: "Developers",
  collapsible: true,
  items: [
    { to: "/settings/api-keys", label: "API Keys", icon: IconKey },
    { to: "/mcp", label: "MCP", icon: IconTerminal },
    { to: "/docs", label: "API Docs", icon: IconBook },
  ],
};

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
        onClick={() => nav("/dashboard/explore")}
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

      <div className="sidebar-foot">
        {renderGroup(DEVELOPERS)}
        {renderItem({ to: "/settings", label: "Settings", icon: IconSettings })}
        <FreshnessFooter />
      </div>
    </aside>
  );
}
