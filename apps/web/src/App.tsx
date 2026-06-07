import { useCallback, useEffect, useState } from "react";
import type { AppDetail, AppListItem, PaginatedResponse } from "@kittie/types";

function formatMoney(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export function App() {
  const [apps, setApps] = useState<AppListItem[]>([]);
  const [selected, setSelected] = useState<AppDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadApps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/apps?sortBy=growth&limit=50");
      if (!res.ok) throw new Error(`API ${res.status}`);
      const body = (await res.json()) as PaginatedResponse<AppListItem>;
      setApps(body.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadApps();
  }, [loadApps]);

  async function openDetail(id: string) {
    const res = await fetch(`/api/v1/apps/${encodeURIComponent(id)}`);
    if (!res.ok) return;
    const body = (await res.json()) as { data: AppDetail };
    setSelected(body.data);
  }

  return (
    <div style={{ padding: "1.5rem 2rem", maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 600 }}>Kittie</h1>
        <p style={{ margin: "0.35rem 0 0", color: "#8b8b97", fontSize: "0.9rem" }}>
          App intelligence — sorted by growth score
        </p>
      </header>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: "#f87171" }}>{error}</p>}

      {!loading && !error && (
        <table>
          <thead>
            <tr>
              <th>App</th>
              <th>Store</th>
              <th>Reviews</th>
              <th>Growth</th>
              <th>Revenue (30d)</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => (
              <tr key={app.id} onClick={() => void openDetail(app.id)} style={{ cursor: "pointer" }}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    {app.iconUrl && (
                      <img src={app.iconUrl} alt="" width={32} height={32} style={{ borderRadius: 8 }} />
                    )}
                    <div>
                      <div>{app.title}</div>
                      <div style={{ fontSize: "0.8rem", color: "#8b8b97" }}>{app.developer}</div>
                    </div>
                    {app.isFirstMover && <span className="badge">First mover</span>}
                  </div>
                </td>
                <td>{app.store}</td>
                <td>{app.reviewCount.toLocaleString()}</td>
                <td>{app.growthScore?.toFixed(1) ?? "—"}</td>
                <td>{formatMoney(app.revenueEstimate30d)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected && (
        <>
          <div className="drawer-backdrop" onClick={() => setSelected(null)} />
          <aside className="drawer">
            <button
              type="button"
              onClick={() => setSelected(null)}
              style={{ background: "none", border: "none", color: "#8b8b97", marginBottom: "1rem" }}
            >
              ← Close
            </button>
            <h2 style={{ marginTop: 0 }}>{selected.title}</h2>
            <p style={{ color: "#8b8b97" }}>{selected.developer}</p>
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.5rem 1rem", fontSize: "0.9rem" }}>
              <dt style={{ color: "#8b8b97" }}>Growth</dt>
              <dd style={{ margin: 0 }}>{selected.growthScore?.toFixed(1) ?? "—"}</dd>
              <dt style={{ color: "#8b8b97" }}>Revenue (30d)</dt>
              <dd style={{ margin: 0 }}>{formatMoney(selected.revenueEstimate30d)}</dd>
              <dt style={{ color: "#8b8b97" }}>Downloads (30d)</dt>
              <dd style={{ margin: 0 }}>{selected.downloadsEstimate30d?.toLocaleString() ?? "—"}</dd>
              <dt style={{ color: "#8b8b97" }}>Rating</dt>
              <dd style={{ margin: 0 }}>
                {selected.rating ?? "—"} ({selected.reviewCount} reviews)
              </dd>
            </dl>
            {selected.description && (
              <p style={{ marginTop: "1.25rem", lineHeight: 1.5, fontSize: "0.9rem" }}>{selected.description}</p>
            )}
          </aside>
        </>
      )}
    </div>
  );
}
