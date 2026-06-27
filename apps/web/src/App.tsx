import { Navigate, Route, Routes } from "react-router-dom";
import { TrendingHome } from "./prototype/TrendingHome";
import { IdeaDetail } from "./prototype/IdeaDetail";
import "./prototype/prototype.css";

// Prototype canvas — Trending Ideas redesign (branch: redesign/trending-ideas).
// Clean surface, no legacy dashboard chrome. Mock data; runs on its own port.
export function App() {
  return (
    <Routes>
      <Route path="/" element={<TrendingHome />} />
      <Route path="/idea/:slug" element={<IdeaDetail />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
