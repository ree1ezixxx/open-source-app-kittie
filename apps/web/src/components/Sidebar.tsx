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

// Information architecture mirrors the live appkittie.com left-nav exactly (groups,
// order, labels). Brand aside, the clone matches truth's taxonomy 1:1. Clone-only
// surfaces with no truth equivalent (Builder, App Engine) are kept as routes but
// omitted from the nav so the sidebar is a faithful clone.
const PRIMARY: Group[] = [
  {
    label: "Explore",
    items: [
      { to: "/dashboard/pulse", label: "Pulse", icon: IconTrending },
      { to: "/dashboard/explore", label: "Apps", icon: IconDatabase, badge: "total" },
      { to: "/dashboard/ads", label: "Ads", icon: IconImage },
      { to: "/dashboard/organic", label: "Organic", icon: IconVideo },
      { to: "/dashboard/highlights", label: "Highlights", icon: IconSpark },
      { to: "/dashboard/trending", label: "Trending", icon: IconTrending },
      { to: "/dashboard/rising", label: "Rising", icon: IconRising },
    ],
  },
  {
    label: "Your apps",
    items: [{ to: "/dashboard/favorites", label: "Favorites", icon: IconStar }],
  },
  {
    label: "ASO",
    items: [
      { to: "/dashboard/aso/apps", label: "App Tracking", icon: IconGrid },
      { to: "/dashboard/aso/keywords", label: "Keyword Explorer", icon: IconSearch },
      { to: "/dashboard/aso/screenshots", label: "Screenshots", icon: IconImage },
      { to: "/dashboard/aso/screenshot-translation", label: "Translations", icon: IconGlobe },
    ],
  },
  {
    label: "Analytics",
    items: [{ to: "/dashboard/reviews", label: "Reviews", icon: IconMessage }],
  },
  {
    label: "App ideas",
    items: [{ to: "/dashboard/hot-ideas", label: "Hot ideas", icon: IconBulb }],
  },
  // New product surface (post-pivot): the market-awareness layer. Not part of the
  // appkittie clone taxonomy above — it's the decision loop the pivot is built around.
  {
    label: "Intelligence",
    items: [{ to: "/intelligence", label: "App Intelligence", icon: IconSparkles }],
  },
];

const DEVELOPERS: Group = {
  label: "API",
  items: [
    { to: "/settings/api-keys", label: "API Keys", icon: IconKey },
    { to: "/mcp", label: "MCP", icon: IconTerminal },
    { to: "/docs", label: "API Docs", icon: IconBook },
  ],
};

const TOOLS: Group = {
  label: "Tools",
  items: [{ to: "/tools/pricing-calculator", label: "Pricing Calculator", icon: IconCoin }],
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
      {renderGroup(DEVELOPERS)}
      {renderGroup(TOOLS)}

      <div className="sidebar-foot">
        {renderItem({ to: "/settings", label: "Settings", icon: IconSettings })}
        <FreshnessFooter />
      </div>
    </aside>
  );
}
