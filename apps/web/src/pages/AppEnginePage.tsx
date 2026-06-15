import { useEffect, useState } from "react";
import { PageShell } from "../components/PageShell";
import { EmptyState } from "../components/EmptyState";
import { Segmented } from "../components/Segmented";
import { AppIcon } from "../components/AppIcon";
import { IconDownload } from "../icons";
import type { Theme } from "../lib/theme";
import "../styles/app-engine.css";

// Shape of GET /api/v1/app-engine/cloneable rows. Defined locally so web never
// imports the server-only @kittie/db package (the parity-pass carve-out). The
// canonical type is owned by the App Engine lane (feat/simulator-first-builder);
// keep this in sync when that lane lands.
interface CloneableAppResponse {
  id: string;
  title: string;
  platform: string;
  repoUrl: string;
  iconUrl?: string | null;
  featuredReason?: string;
  description?: string | null;
  githubStars?: number | null;
  cloneUrl?: string;
  deepLink?: string;
  instructions?: string;
}

const PLATFORMS = [
  { id: "all", label: "All Platforms" },
  { id: "react-native", label: "React Native" },
  { id: "ios-native", label: "iOS Native" },
  { id: "android-native", label: "Android Native" },
];

const REASONS = [
  { id: "all", label: "All" },
  { id: "trending", label: "Trending" },
  { id: "top-grossing", label: "Top Grossing" },
  { id: "curated", label: "Curated" },
];

export function AppEnginePage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const [apps, setApps] = useState<CloneableAppResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<string>("all");
  const [reason, setReason] = useState<string>("all");

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);

    const params = new URLSearchParams();
    if (platform !== "all") params.append("platform", platform);
    if (reason !== "all") params.append("reason", reason);
    params.append("limit", "100");

    fetch(`/api/v1/app-engine/cloneable?${params}`, { signal: ac.signal })
      .then((r) => r.json())
      .then((r) => setApps(r.data || []))
      .catch((e) => {
        if (e?.name !== "AbortError") setApps([]);
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, [platform, reason]);

  const toolbar = (
    <div className="toolbar">
      <Segmented
        value={platform}
        onChange={setPlatform}
        options={PLATFORMS}
      />
      <Segmented
        value={reason}
        onChange={setReason}
        options={REASONS}
      />
    </div>
  );

  return (
    <PageShell
      icon={<IconDownload />}
      title="App Engine"
      sub="Clone trending and successful apps directly into Xcode or Expo Go"
      theme={theme}
      onToggleTheme={onToggleTheme}
      toolbar={toolbar}
      bodyClass="flush"
    >
      <div className="app-engine-container">
        {loading ? (
          <EmptyState icon={<IconDownload />} title="Loading apps…" />
        ) : !apps.length ? (
          <EmptyState
            icon={<IconDownload />}
            title="No cloneable apps"
            sub="Try adjusting your filters"
          />
        ) : (
          <div className="app-grid">
            {apps.map((app) => (
              <CloneableAppCard key={app.id} app={app} />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}

function CloneableAppCard({ app }: { app: CloneableAppResponse }) {
  const [showInstructions, setShowInstructions] = useState(false);

  const handleClone = () => {
    // Generate appropriate clone action based on platform
    if (app.platform === "react-native") {
      // For React Native, copy git clone command
      const cmd = `git clone ${app.repoUrl}`;
      navigator.clipboard.writeText(cmd);
      alert("Clone command copied to clipboard!");
    } else if (app.platform === "ios-native") {
      // Try to open Xcode deep link if available
      const xodeLink = `xcode://clone?repo=${encodeURIComponent(app.repoUrl)}`;
      window.location.href = xodeLink;
      // Fallback: copy git command
      setTimeout(() => {
        const cmd = `git clone ${app.repoUrl}`;
        navigator.clipboard.writeText(cmd);
      }, 1000);
    } else {
      // Copy git clone command
      const cmd = `git clone ${app.repoUrl}`;
      navigator.clipboard.writeText(cmd);
      alert("Clone command copied to clipboard!");
    }
  };

  const platformColor = {
    "react-native": "#61dafb",
    "ios-native": "#000000",
    "android-native": "#3ddc84",
    multi: "#8861e8",
  };

  const reasonEmoji = {
    trending: "🔥",
    "top-grossing": "💰",
    curated: "⭐",
  };

  return (
    <div className="app-card">
      <div className="app-card-header">
        {app.iconUrl && (
          <AppIcon url={app.iconUrl} title={app.title} />
        )}
        <div className="app-card-meta">
          <h3 className="app-card-title">{app.title}</h3>
          <div className="app-card-badges">
            <span className="badge platform" style={{ backgroundColor: platformColor[app.platform as keyof typeof platformColor] || "#ccc" }}>
              {app.platform.replace("-", " ")}
            </span>
            <span className="badge reason">
              {reasonEmoji[app.featuredReason as keyof typeof reasonEmoji] || "📌"} {app.featuredReason}
            </span>
          </div>
        </div>
      </div>

      {app.description && (
        <p className="app-card-description">{app.description}</p>
      )}

      {app.githubStars && (
        <div className="app-card-stats">
          <span>⭐ {(app.githubStars / 1000).toFixed(1)}k stars</span>
        </div>
      )}

      <div className="app-card-actions">
        <button className="btn-clone" onClick={handleClone}>
          📋 Copy Clone Command
        </button>
        <a href={app.repoUrl} target="_blank" rel="noopener noreferrer" className="btn-github">
          → GitHub
        </a>
        <button
          className="btn-instructions"
          onClick={() => setShowInstructions(!showInstructions)}
        >
          {showInstructions ? "Hide" : "Show"} Instructions
        </button>
      </div>

      {showInstructions && (
        <div className="app-card-instructions">
          <pre>{app.instructions || `git clone ${app.repoUrl}`}</pre>
        </div>
      )}
    </div>
  );
}
