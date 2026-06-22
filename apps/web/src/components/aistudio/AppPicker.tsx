import { useEffect, useState } from "react";
import type { AppListItem } from "@kittie/types";
import { fetchTrackedApps } from "../../lib/api/keywords";
import { IconPlus } from "./icons";

/**
 * "Your apps" picker for the AI-Studio flows. Pulls real tracked Apps from the
 * shared API; degrades gracefully to the describe-new path when the API is down
 * or empty. Selecting an App or "new app" is mutually exclusive.
 */
export function AppPicker({
  selectedId,
  newMode,
  onSelectApp,
  onNewMode,
}: {
  selectedId: string | null;
  newMode: boolean;
  onSelectApp: (app: AppListItem) => void;
  onNewMode: () => void;
}) {
  const [apps, setApps] = useState<AppListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchTrackedApps(ctrl.signal)
      .then((rows) => setApps(rows.map((row) => ({
        id: row.appId,
        store: row.store,
        storeAppId: row.appId,
        title: row.title,
        iconUrl: row.iconUrl,
        developer: row.developer,
        category: row.category,
        rating: null,
        reviewCount: 0,
        reviewGrowth7d: null,
        downloadsEstimate30d: null,
        revenueEstimate30d: null,
        growthScore: null,
        growthPct: null,
        downloadsEstimatePrior: null,
        revenueEstimatePrior: null,
        rankDelta: null,
        isFirstMover: false,
        releasedAt: null,
        updatedAt: null,
      }))))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, []);

  return (
    <div>
      <button className={`studio-newapp${newMode ? " active" : ""}`} onClick={onNewMode}>
        <IconPlus />
        <span>
          <span className="studio-newapp-title">New / Unreleased App</span>
          <span className="studio-newapp-sub">Describe your app manually</span>
        </span>
      </button>

      <div className="studio-rail-label studio-apps-label">Your tracked apps</div>

      {loading ? (
        <div className="studio-applist">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="studio-appitem" key={i} style={{ pointerEvents: "none" }}>
              <div className="app-icon skel skel-circ" />
              <div style={{ flex: 1 }}>
                <div className="skel" style={{ height: 11, width: "70%", marginBottom: 5 }} />
                <div className="skel" style={{ height: 9, width: "45%" }} />
              </div>
            </div>
          ))}
        </div>
      ) : apps.length === 0 ? (
        <div className="studio-empty bare">
          <div className="t" style={{ fontSize: 12.5 }}>
            {failed ? "App list unavailable" : "No tracked apps"}
          </div>
          <div className="s" style={{ fontSize: 11.5 }}>
            {failed
              ? "Start the API server to pick a tracked app — or describe a new app above."
              : "Add apps in App Tracking to quickly generate screenshots"}
          </div>
        </div>
      ) : (
        <div className="studio-applist">
          {apps.map((a) => (
            <button
              key={a.id}
              className={`studio-appitem${!newMode && selectedId === a.id ? " active" : ""}`}
              onClick={() => onSelectApp(a)}
            >
              {a.iconUrl ? (
                <img className="app-icon" src={a.iconUrl} alt="" loading="lazy" />
              ) : (
                <div className="app-icon placeholder">{a.title.charAt(0).toUpperCase()}</div>
              )}
              <div style={{ minWidth: 0 }}>
                <div className="name">{a.title}</div>
                <div className="sub">{a.developer}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
