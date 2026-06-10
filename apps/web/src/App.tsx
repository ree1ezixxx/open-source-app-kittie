import { useState, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { ExplorePage } from "./pages/ExplorePage";
import { AppDetailPage } from "./pages/AppDetailPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { HighlightsPage } from "./pages/HighlightsPage";
import { TrendingPage } from "./pages/TrendingPage";
import { RisingPage } from "./pages/RisingPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { AppTrackingPage } from "./pages/aso/AppTrackingPage";
import { KeywordExplorerPage } from "./pages/aso/KeywordExplorerPage";
import {
  IconImage,
  IconGlobe,
  IconMessage,
  IconBulb,
  IconKey,
  IconTerminal,
  IconBook,
  IconCoin,
  IconSettings,
} from "./icons";
import { useTheme } from "./lib/theme";

type Stub = { path: string; title: string; sub: string; lane: string; icon: ReactNode };

// Routes owned by other lanes (B/C/D) + Lane-A pages not yet built. Each lane swaps its stub.
const STUBS: Stub[] = [
  { path: "/dashboard/aso/screenshots", title: "AI Screenshot Generator", sub: "Generate optimized App Store visuals", lane: "Lane C (AI Studio)", icon: <IconImage /> },
  { path: "/dashboard/aso/screenshot-translation", title: "Screenshot Translation", sub: "Localize screenshots for any market", lane: "Lane C (AI Studio)", icon: <IconGlobe /> },
  { path: "/dashboard/reviews", title: "Reviews", sub: "Monitor reviews, sentiment & AI insights", lane: "Lane D (Reviews & Meta)", icon: <IconMessage /> },
  { path: "/dashboard/hot-ideas", title: "Hot app ideas", sub: "AI concepts from fast-growing apps", lane: "Lane C (AI Studio)", icon: <IconBulb /> },
  { path: "/tools/pricing-calculator", title: "App Pricing Calculator", sub: "Localized pricing for 190+ markets", lane: "Lane C (AI Studio)", icon: <IconCoin /> },
  { path: "/settings", title: "Settings", sub: "Subscription, team & account", lane: "Lane D (Reviews & Meta)", icon: <IconSettings /> },
  { path: "/settings/api-keys", title: "API Keys", sub: "Manage keys & credits", lane: "Lane D (Reviews & Meta)", icon: <IconKey /> },
  { path: "/mcp", title: "MCP Server", sub: "App Store intelligence in your IDE", lane: "Lane D (Reviews & Meta)", icon: <IconTerminal /> },
  { path: "/docs", title: "API Docs", sub: "Reference & guides", lane: "Lane D (Reviews & Meta)", icon: <IconBook /> },
];

export function App() {
  const [theme, toggleTheme] = useTheme();
  const [total, setTotal] = useState(0);

  return (
    <div className="app-shell">
      <Sidebar total={total} />
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard/explore" replace />} />
        <Route
          path="/dashboard/explore"
          element={<ExplorePage theme={theme} onToggleTheme={toggleTheme} onTotal={setTotal} />}
        />
        <Route path="/apps/:id" element={<AppDetailPage theme={theme} onToggleTheme={toggleTheme} />} />

        <Route path="/dashboard/highlights" element={<HighlightsPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/trending" element={<TrendingPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/rising" element={<RisingPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/favorites" element={<FavoritesPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/favorites/apps" element={<FavoritesPage theme={theme} onToggleTheme={toggleTheme} />} />

        <Route path="/dashboard/aso/apps" element={<AppTrackingPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/aso/keywords" element={<KeywordExplorerPage theme={theme} onToggleTheme={toggleTheme} />} />

        {STUBS.map((s) => (
          <Route
            key={s.path}
            path={s.path}
            element={
              <PlaceholderPage
                title={s.title}
                sub={s.sub}
                lane={s.lane}
                icon={s.icon}
                theme={theme}
                onToggleTheme={toggleTheme}
              />
            }
          />
        ))}

        <Route path="*" element={<Navigate to="/dashboard/explore" replace />} />
      </Routes>
    </div>
  );
}
