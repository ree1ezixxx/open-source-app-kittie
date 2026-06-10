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
  IconSpark,
} from "../icons";

type Item = { to: string; label: string; icon: typeof IconDatabase; badge?: "total" };
type Group = { label: string; items: Item[] };

const GROUPS: Group[] = [
  {
    label: "Explore",
    items: [
      { to: "/dashboard/explore", label: "Database", icon: IconDatabase, badge: "total" },
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
      { to: "/dashboard/aso/screenshot-translation", label: "Translations", icon: IconGlobe },
    ],
  },
  {
    label: "Analytics",
    items: [{ to: "/dashboard/reviews", label: "Reviews", icon: IconMessage }],
  },
  {
    label: "App Ideas",
    items: [{ to: "/dashboard/hot-ideas", label: "Hot ideas", icon: IconBulb }],
  },
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

<<<<<<< HEAD
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
                {it.badge === "total" && total > 0 && (
                  <span className="nav-count">{total.toLocaleString()}</span>
                )}
              </NavLink>
            );
          })}
        </nav>
      ))}
=======
      <nav className="nav-group">
        <div className="nav-label">Explore</div>
        {NAV.map((n) => {
          const Icon = n.icon;
          return (
            <button
              key={n.id}
              className={`nav-item ${current === n.id ? "active" : ""}`}
              onClick={() => nav(n.id === "database" ? "/" : `/?view=${n.id}`)}
            >
              <Icon />
              <span>{n.label}</span>
              {n.id === "database" && total > 0 && (
                <span className="nav-count">{total.toLocaleString()}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Lane D — temporary nav; reconcile with Lane A's shell nav on rebase */}
      <nav className="nav-group">
        <div className="nav-label">Workspace</div>
        <button
          className={`nav-item ${loc.pathname.startsWith("/reviews") ? "active" : ""}`}
          onClick={() => nav("/reviews/overview")}
        >
          <IconStar />
          <span>Reviews</span>
        </button>
        <button
          className={`nav-item ${loc.pathname === "/mcp" ? "active" : ""}`}
          onClick={() => nav("/mcp")}
        >
          <IconSpark />
          <span>MCP Server</span>
        </button>
      </nav>

      <div className="sidebar-foot">
        <button
          className={`nav-item ${loc.pathname === "/settings" ? "active" : ""}`}
          onClick={() => nav("/settings")}
        >
          <IconSettings />
          <span>Settings</span>
        </button>
      </div>
>>>>>>> feat/reviews-meta
    </aside>
  );
}
