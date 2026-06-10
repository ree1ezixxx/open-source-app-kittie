import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { ExplorePage } from "./pages/ExplorePage";
import { AppDetailPage } from "./pages/AppDetailPage";
import { AdsLibraryPage } from "./pages/AdsLibraryPage";
import { HighlightsPage } from "./pages/HighlightsPage";
import { TrendingPage } from "./pages/TrendingPage";
import { RisingPage } from "./pages/RisingPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { AppTrackingPage } from "./pages/aso/AppTrackingPage";
import { KeywordExplorerPage } from "./pages/aso/KeywordExplorerPage";
import { ScreenshotTranslationPage } from "./pages/ScreenshotTranslationPage";
import { ReviewsPage } from "./pages/reviews/ReviewsPage";
import { McpLandingPage } from "./pages/McpLandingPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ApiKeysPage } from "./pages/ApiKeysPage";
import { DocsPage } from "./pages/DocsPage";
import { ScreenshotGeneratorPage } from "./pages/ScreenshotGeneratorPage";
import { HotIdeasPage } from "./pages/HotIdeasPage";
import { PricingCalculatorPage } from "./pages/PricingCalculatorPage";
/* additive lane (feat/additive) — append-only block */
import { TrackedAppsPage } from "./pages/monitor/TrackedAppsPage";
import { AlertsPage } from "./pages/monitor/AlertsPage";
import { ComparePage } from "./pages/monitor/ComparePage";
import { NicheMiningPage } from "./pages/intel/NicheMiningPage";
import { KeywordGapPage } from "./pages/intel/KeywordGapPage";
import { LocalizationGapPage } from "./pages/intel/LocalizationGapPage";
import { ResearchChatPage } from "./pages/intel/ResearchChatPage";
import { IdeaPrdPage } from "./pages/intel/IdeaPrdPage";
/* end additive lane */
import { useTheme } from "./lib/theme";

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
        <Route path="/app/:slug" element={<AppDetailPage theme={theme} onToggleTheme={toggleTheme} />} />

        <Route path="/dashboard/ads" element={<AdsLibraryPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/highlights" element={<HighlightsPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/trending" element={<TrendingPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/rising" element={<RisingPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/favorites" element={<FavoritesPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/favorites/apps" element={<FavoritesPage theme={theme} onToggleTheme={toggleTheme} />} />

        <Route path="/dashboard/aso/apps" element={<AppTrackingPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/aso/keywords" element={<KeywordExplorerPage theme={theme} onToggleTheme={toggleTheme} />} />

        {/* AI Studio */}
        <Route path="/dashboard/aso/screenshots" element={<ScreenshotGeneratorPage />} />
        <Route path="/dashboard/aso/screenshot-translation" element={<ScreenshotTranslationPage />} />
        <Route path="/dashboard/hot-ideas" element={<HotIdeasPage />} />
        <Route path="/tools/pricing-calculator" element={<PricingCalculatorPage />} />

        {/* Reviews & Meta */}
        <Route path="/reviews" element={<Navigate to="/reviews/overview" replace />} />
        <Route path="/dashboard/reviews" element={<Navigate to="/reviews/overview" replace />} />
        <Route path="/reviews/:tab" element={<ReviewsPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/mcp" element={<McpLandingPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/settings" element={<SettingsPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/settings/api-keys" element={<ApiKeysPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/docs" element={<DocsPage theme={theme} onToggleTheme={toggleTheme} />} />

        {/* additive lane (feat/additive) — append-only block */}
        <Route path="/dashboard/monitor/tracked" element={<TrackedAppsPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/monitor/alerts" element={<AlertsPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/monitor/compare" element={<ComparePage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/intel/mining" element={<NicheMiningPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/intel/keyword-gap" element={<KeywordGapPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/intel/localization" element={<LocalizationGapPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/intel/chat" element={<ResearchChatPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/intel/idea-prd" element={<IdeaPrdPage theme={theme} onToggleTheme={toggleTheme} />} />
        {/* end additive lane */}

        <Route path="*" element={<Navigate to="/dashboard/explore" replace />} />
      </Routes>
    </div>
  );
}
