import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  IconDatabase,
  IconTrending,
  IconRising,
  IconStar,
  IconSettings,
  IconImage,
  IconSpark,
  IconCoin,
} from "../icons";

const NAV: { id: string; label: string; icon: typeof IconDatabase }[] = [
  { id: "database", label: "Database", icon: IconDatabase },
  { id: "trending", label: "Trending", icon: IconTrending },
  { id: "rising", label: "Rising", icon: IconRising },
];

// Lane C — AI Studio routes (additive; the feat/ui shell sidebar supersedes this on rebase)
const STUDIO_NAV: { path: string; label: string; icon: typeof IconDatabase }[] = [
  { path: "/dashboard/aso/screenshots", label: "Screenshot Generator", icon: IconImage },
  { path: "/dashboard/aso/screenshot-translation", label: "Screenshot Translation", icon: IconImage },
  { path: "/dashboard/hot-ideas", label: "Hot ideas", icon: IconSpark },
];
const TOOLS_NAV: { path: string; label: string; icon: typeof IconDatabase }[] = [
  { path: "/tools/pricing-calculator", label: "Pricing Calculator", icon: IconCoin },
];

export function Sidebar({ total }: { total: number }) {
  const loc = useLocation();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const current = loc.pathname === "/" ? sp.get("view") || "database" : "";

  return (
    <aside className="sidebar">
      <button className="brand" onClick={() => nav("/")} style={{ border: "none", background: "none", cursor: "pointer", width: "100%" }}>
        <div className="brand-mark">
          <IconStar style={{ width: 17, height: 17 }} />
        </div>
        <div style={{ textAlign: "left" }}>
          <div className="brand-name">Kittie</div>
          <div className="brand-sub">App intelligence</div>
        </div>
      </button>

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

      <nav className="nav-group">
        <div className="nav-label">AI Studio</div>
        {STUDIO_NAV.map((n) => {
          const Icon = n.icon;
          return (
            <button
              key={n.path}
              className={`nav-item ${loc.pathname === n.path ? "active" : ""}`}
              onClick={() => nav(n.path)}
            >
              <Icon />
              <span>{n.label}</span>
            </button>
          );
        })}
      </nav>

      <nav className="nav-group">
        <div className="nav-label">Tools</div>
        {TOOLS_NAV.map((n) => {
          const Icon = n.icon;
          return (
            <button
              key={n.path}
              className={`nav-item ${loc.pathname === n.path ? "active" : ""}`}
              onClick={() => nav(n.path)}
            >
              <Icon />
              <span>{n.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        <button className="nav-item">
          <IconSettings />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}
