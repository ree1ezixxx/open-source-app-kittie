import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { ExplorePage } from "./pages/ExplorePage";
import { ReportsPage } from "./pages/ReportsPage";
import { ReportDetailPage } from "./pages/ReportDetailPage";
import { AppDetailPage } from "./pages/AppDetailPage";
import { AdsLibraryPage } from "./pages/AdsLibraryPage";
import { OrganicPage } from "./pages/OrganicPage";
import { HighlightsPage } from "./pages/HighlightsPage";
import { PulsePage } from "./pages/PulsePage";
import { TrendingPage } from "./pages/TrendingPage";
import { RisingPage } from "./pages/RisingPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { AppEnginePage } from "./pages/AppEnginePage";
import { BuilderPage } from "./pages/BuilderPage";
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
import { IdeaDetailPage } from "./pages/IdeaDetailPage";
import { PricingCalculatorPage } from "./pages/PricingCalculatorPage";
import { IntelligenceHome } from "./pages/AppIntelligence/IntelligenceHome";
import { ValidatePage } from "./pages/AppIntelligence/ValidatePage";
import { SimilarPage } from "./pages/AppIntelligence/SimilarPage";
import { useTheme } from "./lib/theme";
import { prefetchForRoute } from "./lib/routePrefetch";

function RedirectWithSearch({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

export function App() {
  const [theme, toggleTheme] = useTheme();
  const [total, setTotal] = useState(0);
  // /studio/* runs the Builder full-bleed, outside the Kittie dashboard chrome.
  const { pathname } = useLocation();
  const studio = pathname.startsWith("/studio");

  useEffect(() => prefetchForRoute(pathname), [pathname]);

  return (
    <div className={studio ? "app-shell studio" : "app-shell"}>
      {!studio && <Sidebar total={total} />}
      <Routes>
        <Route path="/studio" element={<BuilderPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/studio/:id" element={<BuilderPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/" element={<Navigate to="/dashboard/pulse" replace />} />
        <Route path="/dashboard/pulse" element={<PulsePage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route
          path="/dashboard/explore"
          element={<ExplorePage theme={theme} onToggleTheme={toggleTheme} onTotal={setTotal} />}
        />
        <Route path="/apps/:id" element={<AppDetailPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/app/:slug" element={<AppDetailPage theme={theme} onToggleTheme={toggleTheme} />} />

        <Route path="/dashboard/ads" element={<AdsLibraryPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/organic" element={<OrganicPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/highlights" element={<HighlightsPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/trending" element={<TrendingPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/rising" element={<RisingPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/app-engine" element={<AppEnginePage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/builder" element={<BuilderPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/builder/:id" element={<BuilderPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/favorites" element={<FavoritesPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/favorites/:tab" element={<FavoritesPage theme={theme} onToggleTheme={toggleTheme} />} />

        <Route path="/dashboard/aso/apps" element={<AppTrackingPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/aso/keywords" element={<KeywordExplorerPage theme={theme} onToggleTheme={toggleTheme} />} />

        {/* AI Studio */}
        <Route path="/dashboard/aso/screenshots" element={<ScreenshotGeneratorPage />} />
        <Route path="/dashboard/aso/screenshot-translation" element={<ScreenshotTranslationPage />} />
        <Route path="/dashboard/hot-ideas" element={<HotIdeasPage />} />
        <Route path="/dashboard/hot-ideas/:slug" element={<IdeaDetailPage />} />
        <Route path="/tools/pricing-calculator" element={<PricingCalculatorPage />} />

        {/* App Intelligence (Lane C) */}
        <Route path="/intelligence" element={<IntelligenceHome />} />
        <Route path="/intelligence/validate" element={<ValidatePage />} />
        <Route path="/intelligence/similar" element={<SimilarPage />} />

        {/* Reviews & Meta */}
        <Route path="/dashboard/reviews" element={<RedirectWithSearch to="/dashboard/reviews/overview" />} />
        <Route path="/dashboard/reviews/:tab" element={<ReviewsPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/reviews" element={<RedirectWithSearch to="/dashboard/reviews/overview" />} />
        {/* legacy: the feed tab used to be /reviews/reviews — keep old links alive */}
        <Route path="/reviews/reviews" element={<RedirectWithSearch to="/dashboard/reviews/feed" />} />
        <Route path="/reviews/:tab" element={<LegacyReviewsRedirect />} />
        <Route path="/mcp" element={<McpLandingPage theme={theme} onToggleTheme={toggleTheme} />} />

        {/* Reports (thin, local-first) */}
        <Route path="/reports" element={<ReportsPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/reports/:template" element={<ReportDetailPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/settings" element={<SettingsPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/settings/api-keys" element={<ApiKeysPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/docs" element={<DocsPage theme={theme} onToggleTheme={toggleTheme} />} />

        <Route path="*" element={<Navigate to="/dashboard/pulse" replace />} />
      </Routes>
    </div>
  );
}

function LegacyReviewsRedirect() {
  const { tab } = useParams();
  const target = tab === "reviews" ? "feed" : tab || "overview";
  return <RedirectWithSearch to={`/dashboard/reviews/${target}`} />;
}
