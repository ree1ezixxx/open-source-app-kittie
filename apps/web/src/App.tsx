import { useState, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { ExplorePage } from "./pages/ExplorePage";
import { AppDetailPage } from "./pages/AppDetailPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import {
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
} from "./icons";
import { useTheme } from "./lib/theme";

type Stub = { path: string; title: string; sub: string; lane: string; icon: ReactNode };

// Routes owned by other lanes (B/C/D) + Lane-A pages not yet built. Each lane swaps its stub.
const STUBS: Stub[] = [
  { path: "/dashboard/highlights", title: "Dashboard Highlights", sub: "New big hits, top gainers & losers", lane: "Lane A", icon: <IconSpark /> },
  { path: "/dashboard/trending", title: "Store Rankings", sub: "Top charts by country and category", lane: "Lane A", icon: <IconTrending /> },
  { path: "/dashboard/rising", title: "Rising Apps", sub: "Apps with accelerating revenue", lane: "Lane A", icon: <IconRising /> },
  { path: "/dashboard/favorites", title: "Favorites", sub: "Apps, ads, creators & saved ideas", lane: "Lane A", icon: <IconStar /> },
  { path: "/dashboard/favorites/apps", title: "Favorites", sub: "Apps, ads, creators & saved ideas", lane: "Lane A", icon: <IconStar /> },
  { path: "/dashboard/aso/apps", title: "App Keyword Tracking", sub: "Track apps & discover keyword opportunities", lane: "Lane B (ASO Keywords)", icon: <IconGrid /> },
  { path: "/dashboard/aso/keywords", title: "Keyword Explorer", sub: "Difficulty, popularity & related keywords", lane: "Lane B (ASO Keywords)", icon: <IconSearch /> },
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
