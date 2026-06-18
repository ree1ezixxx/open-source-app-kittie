import { useState } from "react";
import { loadTrackedApps, type TrackedAppSummary } from "../../lib/translationService";
import { IconPlus } from "./icons";

/**
 * "Your tracked apps" picker for the AI-Studio flows. Reads the apps tracked on
 * the App Tracking page (localStorage) — the same source as the Translation
 * surface and what appkittie shows here. The Search / Paste-URL finder is how
 * you reach any other app, so this never hits the heavy /apps catalog.
 */
export function AppPicker({
  selectedId,
  newMode,
  onSelectApp,
  onNewMode,
}: {
  selectedId: string | null;
  newMode: boolean;
  onSelectApp: (app: TrackedAppSummary) => void;
  onNewMode: () => void;
}) {
  const [apps] = useState<TrackedAppSummary[]>(() => loadTrackedApps());

  return (
    <div>
      <button className={`studio-newapp${newMode ? " active" : ""}`} onClick={onNewMode}>
        <IconPlus />
        <span>Describe a new / unreleased app</span>
      </button>

      {apps.length === 0 ? (
        <div className="studio-empty bare">
          <div className="t" style={{ fontSize: 12.5 }}>No tracked apps</div>
          <div className="s" style={{ fontSize: 11.5 }}>
            Add apps in App Tracking to quickly generate screenshots — or search the store above.
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
                <div className="sub">{a.developer}{a.category ? ` · ${a.category}` : ""}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
