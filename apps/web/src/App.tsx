import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { AskPage } from "./pages/AskPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ReportDetailPage } from "./pages/ReportDetailPage";
import { AppDetailPage } from "./pages/AppDetailPage";
import { PulsePage } from "./pages/PulsePage";
import { AppEnginePage } from "./pages/AppEnginePage";
import { BuilderPage } from "./pages/BuilderPage";
import { McpLandingPage } from "./pages/McpLandingPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ApiKeysPage } from "./pages/ApiKeysPage";
import { DocsPage } from "./pages/DocsPage";
import { IntelligenceHome } from "./pages/AppIntelligence/IntelligenceHome";
import { ValidatePage } from "./pages/AppIntelligence/ValidatePage";
import { SimilarPage } from "./pages/AppIntelligence/SimilarPage";
import { useTheme } from "./lib/theme";
import { prefetchForRoute } from "./lib/routePrefetch";

export function App() {
  const [theme, toggleTheme] = useTheme();
  // /studio/* runs the Builder full-bleed, outside the Kittie dashboard chrome.
  const { pathname } = useLocation();
  const studio = pathname.startsWith("/studio");

  useEffect(() => prefetchForRoute(pathname), [pathname]);

  return (
    <div className={studio ? "app-shell studio" : "app-shell"}>
      {!studio && <Sidebar total={0} />}
      <Routes>
        <Route path="/studio" element={<BuilderPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/studio/:id" element={<BuilderPage theme={theme} onToggleTheme={toggleTheme} />} />

        {/* Engine-first front door. */}
        <Route path="/" element={<Navigate to="/ask" replace />} />
        <Route path="/ask" element={<AskPage theme={theme} onToggleTheme={toggleTheme} />} />

        {/* Reports (thin, local-first). */}
        <Route path="/reports" element={<ReportsPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/reports/:template" element={<ReportDetailPage theme={theme} onToggleTheme={toggleTheme} />} />

        {/* App Intelligence (Lane C). */}
        <Route path="/intelligence" element={<IntelligenceHome />} />
        <Route path="/intelligence/validate" element={<ValidatePage />} />
        <Route path="/intelligence/similar" element={<SimilarPage />} />
        <Route path="/apps/:id" element={<AppDetailPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/app/:slug" element={<AppDetailPage theme={theme} onToggleTheme={toggleTheme} />} />

        {/* Developers. */}
        <Route path="/mcp" element={<McpLandingPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/docs" element={<DocsPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/settings" element={<SettingsPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/settings/api-keys" element={<ApiKeysPage theme={theme} onToggleTheme={toggleTheme} />} />

        {/* Retained non-nav surfaces (reachable by URL). */}
        <Route path="/dashboard/pulse" element={<PulsePage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/app-engine" element={<AppEnginePage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/builder" element={<BuilderPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/dashboard/builder/:id" element={<BuilderPage theme={theme} onToggleTheme={toggleTheme} />} />

        <Route path="*" element={<Navigate to="/ask" replace />} />
      </Routes>
    </div>
  );
}
