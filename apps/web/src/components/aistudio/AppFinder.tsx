import { useEffect, useRef, useState, type CSSProperties } from "react";
import { searchStoreApps, lookupStoreApp, type StoreApp } from "../../lib/api/appFinder";
import { IconSearch } from "../../icons";

/**
 * "Find app details" intake — search the App Store or paste a store URL to pull
 * a real listing into the AI Studio. Mirrors appkittie's Search / Paste URL
 * modes. Calls `onPick` with the resolved app.
 */
type Mode = "search" | "url";

export function AppFinder({
  onPick,
  busy,
}: {
  onPick: (app: StoreApp) => void;
  /** External label shown while the parent imports the picked app. */
  busy?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StoreApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Debounced live search (search mode only).
  useEffect(() => {
    if (mode !== "search") return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      searchStoreApps(q, ac.signal)
        .then((r) => {
          setResults(r);
          setError(null);
          setLoading(false);
        })
        .catch((e: unknown) => {
          if (ac.signal.aborted) return;
          setError(e instanceof Error ? e.message : "Search failed");
          setLoading(false);
        });
    }, 320);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [query, mode]);

  // Close result list on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setResults([]);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function loadUrl() {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const app = await lookupStoreApp(q);
      pick(app);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  function pick(app: StoreApp) {
    setResults([]);
    setQuery("");
    onPick(app);
  }

  return (
    <div className="app-finder" ref={ref}>
      <div className="app-finder-modes">
        <button
          type="button"
          className={`studio-chip${mode === "search" ? " on" : ""}`}
          onClick={() => {
            setMode("search");
            setError(null);
          }}
        >
          Search
        </button>
        <button
          type="button"
          className={`studio-chip${mode === "url" ? " on" : ""}`}
          onClick={() => {
            setMode("url");
            setResults([]);
            setError(null);
          }}
        >
          Paste URL
        </button>
        <span className="app-finder-hint">Pull a real listing from the App Store</span>
      </div>

      <div className="app-finder-row">
        <div className="search" style={{ flex: 1, minWidth: 0 }}>
          <IconSearch />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => mode === "url" && e.key === "Enter" && loadUrl()}
            placeholder={mode === "search" ? "Search App Store or Google Play…" : "Paste an App Store URL…"}
            spellCheck={false}
          />
        </div>
        {mode === "url" && (
          <button type="button" className="btn" onClick={loadUrl} disabled={loading || busy || !query.trim()}>
            {loading || busy ? "Loading…" : "Load"}
          </button>
        )}
      </div>

      {error && <div className="app-finder-error">{error}</div>}

      {mode === "search" && (loading || results.length > 0) && (
        <div className="app-finder-results">
          {loading && results.length === 0 ? (
            <div className="app-finder-empty">Searching…</div>
          ) : (
            results.map((app) => (
              <button key={app.storeAppId} type="button" className="app-finder-item" onClick={() => pick(app)}>
                {app.iconUrl ? (
                  <img src={app.iconUrl} alt="" loading="lazy" style={iconStyle} />
                ) : (
                  <div style={{ ...iconStyle, display: "grid", placeItems: "center" }}>{app.title.charAt(0)}</div>
                )}
                <div style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                  <div className="app-finder-name">{app.title}</div>
                  <div className="app-finder-dev">
                    {app.developer}
                    {app.category ? ` · ${app.category}` : ""}
                    {app.screenshotUrls.length > 0 ? ` · ${app.screenshotUrls.length} shots` : ""}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const iconStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 9,
  objectFit: "cover",
  flexShrink: 0,
  background: "var(--surface-2)",
  border: "1px solid var(--border-soft)",
};
