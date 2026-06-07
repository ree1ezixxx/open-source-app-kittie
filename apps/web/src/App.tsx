import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { ExplorePage } from "./pages/ExplorePage";
import { AppDetailPage } from "./pages/AppDetailPage";
import { ReviewsPage } from "./pages/reviews/ReviewsPage";
import { McpLandingPage } from "./pages/McpLandingPage";
import { SettingsPage } from "./pages/SettingsPage";
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

        {/* Lane D — Reviews & Meta */}
        <Route path="/reviews" element={<Navigate to="/reviews/overview" replace />} />
        <Route path="/dashboard/reviews" element={<Navigate to="/reviews/overview" replace />} />
        <Route
          path="/reviews/:tab"
          element={<ReviewsPage theme={theme} onToggleTheme={toggleTheme} />}
        />
        <Route path="/mcp" element={<McpLandingPage theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/settings" element={<SettingsPage theme={theme} onToggleTheme={toggleTheme} />} />
      </Routes>
    </div>
  );
}
