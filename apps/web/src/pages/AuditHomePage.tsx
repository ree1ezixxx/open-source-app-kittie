import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { AppListItem } from "@kittie/types";
import { listApps } from "../lib/api";
import "./audit-home.css";

// Audit-home module (#176): the trending "market pulse" as a feeder INTO the
// audit engine — not the primary surface. Real movers (growthType: positive);
// every tile deep-links to /audit?app=<id>. Reuses the prototype carousel design.

function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

function Logo({ app }: { app: AppListItem }) {
  const [broken, setBroken] = useState(false);
  if (app.iconUrl && !broken) {
    return <img className="ah-logo" src={app.iconUrl} alt={app.title} loading="lazy" onError={() => setBroken(true)} />;
  }
  const initials = app.title.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const hue = hueOf(app.title);
  return (
    <div className="ah-logo" style={{ background: `linear-gradient(140deg, hsl(${hue} 70% 55%), hsl(${(hue + 36) % 360} 65% 44%))` }} aria-hidden>
      {initials}
    </div>
  );
}

function Tile({ app }: { app: AppListItem }) {
  const pct = app.growthPct;
  return (
    <Link className="ah-tile" to={`/audit?app=${encodeURIComponent(app.id)}`}>
      <div className="ah-tile-top">
        <Logo app={app} />
        <div className="ah-tile-id">
          <div className="ah-name">{app.title}</div>
          <div className="ah-cat">{app.category ?? "—"}</div>
        </div>
      </div>
      <div className="ah-tile-foot">
        {pct != null && <span className={`ah-delta ${pct >= 0 ? "up" : "down"}`}>{pct >= 0 ? "▴" : "▾"} {Math.abs(pct).toFixed(0)}%</span>}
        {app.growthScore != null && <span className="ah-metric">momentum {Math.round(app.growthScore)}</span>}
      </div>
    </Link>
  );
}

export function AuditHomePage() {
  const [apps, setApps] = useState<AppListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    listApps({ growthType: "positive", limit: 120 }, ac.signal)
      .then((r) => !ac.signal.aborted && setApps(r.data))
      .catch((e) => !ac.signal.aborted && setError(e.message))
      .finally(() => !ac.signal.aborted && setLoading(false));
    return () => ac.abort();
  }, []);

  const rows = useMemo(() => {
    const byCat = new Map<string, AppListItem[]>();
    for (const a of apps) {
      const cat = a.category ?? "Other";
      (byCat.get(cat) ?? byCat.set(cat, []).get(cat)!).push(a);
    }
    return [...byCat.entries()]
      .filter(([, list]) => list.length >= 4)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 8)
      .map(([cat, list], i) => ({
        cat,
        list: [...list].sort((a, b) => (b.growthScore ?? 0) - (a.growthScore ?? 0)).slice(0, 12),
        rtl: i % 2 === 1,
      }));
  }, [apps]);

  return (
    <div className="ah-root">
      <header className="ah-hero">
        <div className="ah-kicker">live market pulse · feeds the audit engine</div>
        <h1>Winners copy <span className="ah-accent">winners.</span></h1>
        <p>Apps on the rise — not incumbents. Tap any app to open its audit: scores, evidence, and a build-ready brief.</p>
      </header>

      {loading && <div className="ah-msg">Loading movers…</div>}
      {error && <div className="ah-msg">{error}</div>}
      {!loading && !error && rows.length === 0 && <div className="ah-msg">No movers tracked yet — ingest needs ≥2 daily snapshots.</div>}

      <main className="ah-rows">
        {rows.map((r) => {
          const loop = [...r.list, ...r.list];
          return (
            <section className="ah-row" key={r.cat}>
              <div className="ah-row-head">
                <h2>{r.cat} is moving</h2>
                <span className="ah-pulse">{r.list.length} rising apps</span>
              </div>
              <div className="ah-marquee">
                <div className={`ah-track ${r.rtl ? "rtl" : ""}`}>
                  {loop.map((a, i) => (
                    <Tile key={`${a.id}-${i}`} app={a} />
                  ))}
                </div>
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
