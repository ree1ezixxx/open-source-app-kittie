import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  IconDatabase,
  IconTrending,
  IconRising,
  IconStar,
  IconSettings,
  IconSpark,
} from "../icons";

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
    </aside>
  );
}
