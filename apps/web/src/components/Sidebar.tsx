import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  IconDatabase,
  IconSpark,
  IconTrending,
  IconRising,
  IconStar,
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
  /* additive lane (feat/additive) — append-only block */
  IconHeart,
  IconInfo,
  IconChart,
  IconFilter,
  IconRank,
  /* end additive lane */
} from "../icons";

type Item = {
  to: string;
  label: string;
  icon: typeof IconDatabase;
  badge?: "total";
  /** "key": needs GEMINI_API_KEY (red-! clears live once set).
      "mock": surface still backed by mock data (always flagged). */
  flag?: "key" | "mock";
};
type Group = { label: string; items: Item[] };

const FLAG_TITLE: Record<"key" | "mock", string> = {
  key: "Needs a Gemini API key — set one in API Keys to activate",
  mock: "Mock data — not yet wired to a live source",
};

const GROUPS: Group[] = [
  {
    label: "Explore",
    items: [
      { to: "/dashboard/explore", label: "Database", icon: IconDatabase, badge: "total" },
      { to: "/dashboard/ads", label: "Ads Library", icon: IconImage },
      { to: "/dashboard/highlights", label: "Highlights", icon: IconSpark },
      { to: "/dashboard/trending", label: "Trending", icon: IconTrending },
      { to: "/dashboard/rising", label: "Rising", icon: IconRising },
    ],
  },
  {
    label: "Your Apps",
    items: [{ to: "/dashboard/favorites", label: "Favorites", icon: IconStar }],
  },
  {
    label: "ASO",
    items: [
      { to: "/dashboard/aso/apps", label: "App Tracking", icon: IconGrid },
      { to: "/dashboard/aso/keywords", label: "Keyword Explorer", icon: IconSearch },
      { to: "/dashboard/aso/screenshots", label: "Screenshots", icon: IconImage },
      { to: "/dashboard/aso/screenshot-translation", label: "Translations", icon: IconGlobe, flag: "mock" },
    ],
  },
  {
    label: "Analytics",
    items: [{ to: "/dashboard/reviews", label: "Reviews", icon: IconMessage, flag: "mock" }],
  },
  {
    label: "App Ideas",
    items: [{ to: "/dashboard/hot-ideas", label: "Hot ideas", icon: IconBulb, flag: "key" }],
  },
  /* additive lane (feat/additive) — append-only block */
  {
    label: "Monitor",
    items: [
      { to: "/dashboard/monitor/tracked", label: "Tracked Apps", icon: IconHeart },
      { to: "/dashboard/monitor/alerts", label: "Alerts", icon: IconInfo },
      { to: "/dashboard/monitor/compare", label: "Compare", icon: IconChart },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { to: "/dashboard/intel/mining", label: "Niche Mining", icon: IconFilter },
      { to: "/dashboard/intel/keyword-gap", label: "Keyword Gap", icon: IconRank },
      { to: "/dashboard/intel/localization", label: "Localization", icon: IconGlobe },
      { to: "/dashboard/intel/chat", label: "Research Chat", icon: IconMessage, flag: "key" },
    ],
  },
  /* end additive lane */
  {
    label: "API",
    items: [
      { to: "/settings/api-keys", label: "API Keys", icon: IconKey },
      { to: "/mcp", label: "MCP", icon: IconTerminal },
      { to: "/docs", label: "API Docs", icon: IconBook },
    ],
  },
  {
    label: "Tools",
    items: [
      { to: "/tools/pricing-calculator", label: "Pricing Calculator", icon: IconCoin },
      { to: "/settings", label: "Settings", icon: IconSettings },
    ],
  },
];

export function Sidebar({ total = 0 }: { total?: number }) {
  const nav = useNavigate();

  // Live key gating: a "key"-flagged item shows the red-! only while the seam
  // is off, so the warning clears the moment a Gemini key is set.
  const [seamEnabled, setSeamEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/v1/assist/status", { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => setSeamEnabled(Boolean(b?.data?.enabled)))
      .catch(() => setSeamEnabled(false));
    return () => ac.abort();
  }, []);

  const showFlag = (flag?: "key" | "mock"): boolean => {
    if (flag === "mock") return true;
    if (flag === "key") return seamEnabled === false; // hide until we know it's off
    return false;
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

      {GROUPS.map((g) => (
        <nav className="nav-group" key={g.label}>
          <div className="nav-label">{g.label}</div>
          {g.items.map((it) => {
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
                {showFlag(it.flag) && (
                  <span
                    className="nav-flag"
                    title={FLAG_TITLE[it.flag!]}
                    aria-label={FLAG_TITLE[it.flag!]}
                  >
                    !
                  </span>
                )}
                {it.badge === "total" && total > 0 && (
                  <span className="nav-count">{total.toLocaleString()}</span>
                )}
              </NavLink>
            );
          })}
        </nav>
      ))}
    </aside>
  );
}
