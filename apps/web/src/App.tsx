import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { ExplorePage } from "./pages/ExplorePage";
import { AppDetailPage } from "./pages/AppDetailPage";
import { ScreenshotGeneratorPage } from "./pages/ScreenshotGeneratorPage";
import { ScreenshotTranslationPage } from "./pages/ScreenshotTranslationPage";
import { HotIdeasPage } from "./pages/HotIdeasPage";
import { PricingCalculatorPage } from "./pages/PricingCalculatorPage";
import { useTheme } from "./lib/theme";

export function App() {
  const [theme, toggleTheme] = useTheme();
  const [total, setTotal] = useState(0);

  return (
    <div className="app-shell">
      <Sidebar total={total} />
      <Routes>
        <Route
          path="/"
          element={<ExplorePage theme={theme} onToggleTheme={toggleTheme} onTotal={setTotal} />}
        />
        <Route
          path="/apps/:id"
          element={<AppDetailPage theme={theme} onToggleTheme={toggleTheme} />}
        />

        {/* Lane C — AI Studio (rebase onto feat/ui shell router when it lands) */}
        <Route path="/dashboard/aso/screenshots" element={<ScreenshotGeneratorPage />} />
        <Route path="/dashboard/aso/screenshot-translation" element={<ScreenshotTranslationPage />} />
        <Route path="/dashboard/hot-ideas" element={<HotIdeasPage />} />
        <Route path="/tools/pricing-calculator" element={<PricingCalculatorPage />} />
      </Routes>
    </div>
  );
}
