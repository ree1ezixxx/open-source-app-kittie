import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  IconDatabase,
  IconTrending,
  IconRising,
  IconStar,
  IconSettings,
  IconChart,
} from "../icons";
import { IconKey } from "./aso/icons";

const NAV: { id: string; label: string; icon: typeof IconDatabase }[] = [
  { id: "database", label: "Database", icon: IconDatabase },
  { id: "trending", label: "Trending", icon: IconTrending },
  { id: "rising", label: "Rising", icon: IconRising },
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
        <div className="nav-label">ASO</div>
        <button
          className={`nav-item ${loc.pathname.startsWith("/dashboard/aso/apps") ? "active" : ""}`}
          onClick={() => nav("/dashboard/aso/apps")}
        >
          <IconChart />
          <span>App Tracking</span>
        </button>
        <button
          className={`nav-item ${loc.pathname.startsWith("/dashboard/aso/keywords") ? "active" : ""}`}
          onClick={() => nav("/dashboard/aso/keywords")}
        >
          <IconKey />
          <span>Keyword Explorer</span>
        </button>
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
