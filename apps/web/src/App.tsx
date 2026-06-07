import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { ExplorePage } from "./pages/ExplorePage";
import { AppDetailPage } from "./pages/AppDetailPage";
import { AppTrackingPage } from "./pages/aso/AppTrackingPage";
import { KeywordExplorerPage } from "./pages/aso/KeywordExplorerPage";
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
        {/* Lane B — ASO */}
        <Route
          path="/dashboard/aso/apps"
          element={<AppTrackingPage theme={theme} onToggleTheme={toggleTheme} />}
        />
        <Route
          path="/dashboard/aso/keywords"
          element={<KeywordExplorerPage theme={theme} onToggleTheme={toggleTheme} />}
        />
        <Route path="/keywords" element={<Navigate to="/dashboard/aso/keywords" replace />} />
      </Routes>
    </div>
  );
}
