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
import { ReviewsPage } from "./pages/reviews/ReviewsPage";
import { McpLandingPage } from "./pages/McpLandingPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ScreenshotGeneratorPage } from "./pages/ScreenshotGeneratorPage";
import { HotIdeasPage } from "./pages/HotIdeasPage";
import { PricingCalculatorPage } from "./pages/PricingCalculatorPage";
import {
  IconGlobe,
  IconKey,
  IconBook,
} from "./icons";
import { useTheme } from "./lib/theme";

type Stub = { path: string; title: string; sub: string; lane: string; icon: ReactNode };

// Remaining unbuilt routes — swapped for real pages as they land.
const STUBS: Stub[] = [
  { path: "/dashboard/aso/screenshot-translation", title: "Screenshot Translation", sub: "Localize screenshots for any market", lane: "Lane C (AI Studio)", icon: <IconGlobe /> },
  { path: "/settings/api-keys", title: "API Keys", sub: "Manage keys & credits", lane: "Lane D (Reviews & Meta)", icon: <IconKey /> },
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

        {/* Lane C — AI Studio */}
        <Route path="/dashboard/aso/screenshots" element={<ScreenshotGeneratorPage />} />
        <Route path="/dashboard/hot-ideas" element={<HotIdeasPage />} />
        <Route path="/tools/pricing-calculator" element={<PricingCalculatorPage />} />

        {/* Lane D — Reviews & Meta */}
        <Route path="/reviews" element={<Navigate to="/reviews/overview" replace />} />
        <Route path="/dashboard/reviews" element={<Navigate to="/reviews/overview" replace />} />
        <Route path="/reviews/:tab" element={<ReviewsPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/mcp" element={<McpLandingPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/settings" element={<SettingsPage theme={theme} onToggleTheme={toggleTheme} />} />

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
