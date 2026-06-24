import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "../../styles/intelligence.css";
import { ConfidenceBadge, CoverageBadge } from "../../components/DecisionBadges";
import { AgentView } from "../../components/intelligence/AgentView";
import { IconArrowLeft, IconExternal, IconGrid } from "../../icons";
import { findSimilar } from "../../lib/intelligence/client";
import { pushRecent } from "../../lib/intelligence/recents";
import type { SimilarApp, SimilarityClass, SimilarOutput } from "../../lib/intelligence/types";

const CLASSES: { value: SimilarityClass | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "direct", label: "Direct" },
  { value: "adjacent", label: "Adjacent" },
  { value: "analogue", label: "Analogue" },
];

const fmtNum = (n: number | null): string => {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
};
const fmtMoney = (n: number | null): string => (n == null ? "—" : `$${fmtNum(n)}`);

function AppCard({ app }: { app: SimilarApp }) {
  return (
    <div className="sim-card">
      <div className="sim-card-top">
        <span className="sim-icon">{app.iconUrl ? <img src={app.iconUrl} alt="" /> : <IconGrid />}</span>
        <div>
          <div className="sim-name">{app.name}</div>
          <div className="sim-cat">{app.category ?? "Uncategorised"}</div>
        </div>
        <div className="sim-score">
          <div className="sim-score-num">{Math.round(app.similarityScore * 100)}%</div>
          <span className={`sim-class-tag ${app.similarityClass}`}>{app.similarityClass}</span>
        </div>
      </div>
      <ul className="sim-reasons">
        {app.reasons.slice(0, 2).map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      <div className="sim-metrics">
        <span>
          Est. rev <b>{fmtMoney(app.estRevenue)}</b>/mo
        </span>
        <span>
          Downloads <b>{fmtNum(app.estDownloads)}</b>/mo
        </span>
        <span>
          Rating <b>{app.rating?.toFixed(1) ?? "—"}</b>
        </span>
      </div>
      <div className="sim-card-foot">
        <ConfidenceBadge confidence={app.confidence} compact />
        <Link className="sim-teardown-link" to={`/apps/${encodeURIComponent(app.appId)}`}>
          Teardown <IconExternal style={{ width: 12, height: 12 }} />
        </Link>
      </div>
    </div>
  );
}

export function SimilarPage() {
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") ?? "";
  const filter = (sp.get("class") as SimilarityClass | null) ?? "all";
  const [input, setInput] = useState(q);
  const [result, setResult] = useState<SimilarOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const recorded = useRef<string>("");

  useEffect(() => setInput(q), [q]);

  useEffect(() => {
    if (!q) {
      setResult(null);
      return;
    }
    let alive = true;
    setLoading(true);
    const ctrl = new AbortController();
    findSimilar(q, ctrl.signal)
      .then((r) => {
        if (!alive) return;
        setResult(r);
        if (recorded.current !== q) {
          pushRecent({ kind: "similar", label: r.interpretedQuery, href: `/intelligence/similar?q=${encodeURIComponent(q)}` });
          recorded.current = q;
        }
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [q]);

  function submit() {
    const v = input.trim();
    if (v) setSp({ q: v }, { replace: false });
  }

  function setFilter(c: SimilarityClass | "all") {
    const next = new URLSearchParams(sp);
    if (c === "all") next.delete("class");
    else next.set("class", c);
    setSp(next, { replace: true });
  }

  const clusters = (result?.clusters ?? []).filter((c) => filter === "all" || c.cls === filter);
  const candidates = (result?.candidates ?? []).filter((a) => filter === "all" || a.similarityClass === filter);

  return (
    <main className="main">
      <div className="intel">
        <div className="intel-crumb">
          <Link to="/intelligence">
            <IconArrowLeft style={{ width: 12, height: 12 }} /> App Intelligence
          </Link>
          <span>/ Similar apps</span>
        </div>
        <h1 className="intel-title">Find similar apps</h1>
        <p className="intel-sub">
          Describe a product — a name, a category, or what it does. You'll get its competitor clusters, ranked by why
          they match, each with a path straight into a teardown.
        </p>

        <div className="intel-form">
          <input
            className="intel-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="e.g. a habit tracker with streaks, or 'Calm'"
            spellCheck={false}
          />
          <button className="intel-submit" onClick={submit} disabled={!input.trim()}>
            Find
          </button>
        </div>

        {loading && (
          <div className="intel-loading">
            <div className="intel-skel" style={{ height: 40 }} />
            <div className="intel-skel" style={{ height: 220 }} />
          </div>
        )}

        {!loading && result && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              {result.source === "mock" && (
                <span className="intel-preview" title="Wired to a preview fixture until the retrieval endpoint lands">
                  <span className="intel-preview-dot" /> Preview data
                </span>
              )}
              <CoverageBadge coverage={result.coverage} />
            </div>

            <p className="intel-interpreted">
              Interpreted as: <b>{result.interpretedQuery}</b>
            </p>

            <div className="sim-filters">
              {CLASSES.map((c) => (
                <button key={c.value} className={`sim-filter${filter === c.value ? " on" : ""}`} onClick={() => setFilter(c.value)}>
                  {c.label}
                </button>
              ))}
            </div>

            {clusters.map((cluster) => (
              <div className="sim-cluster" key={cluster.label}>
                <div className="sim-cluster-head">
                  <span className={`sim-class-tag ${cluster.cls}`}>{cluster.cls}</span>
                  <h4>{cluster.label}</h4>
                </div>
                {cluster.apps.length === 0 ? (
                  <div className="intel-empty">No apps in this cluster.</div>
                ) : (
                  <div className="sim-grid">
                    {cluster.apps.map((a) => (
                      <AppCard app={a} key={a.appId} />
                    ))}
                  </div>
                )}
              </div>
            ))}

            <section className="intel-section">
              <h3>Raw candidates ({candidates.length})</h3>
              <table className="sim-table">
                <thead>
                  <tr>
                    <th>App</th>
                    <th>Class</th>
                    <th>Match</th>
                    <th>Est. rev/mo</th>
                    <th>Downloads/mo</th>
                    <th>Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((a) => (
                    <tr key={a.appId}>
                      <td>{a.name}</td>
                      <td>{a.similarityClass}</td>
                      <td className="num">{Math.round(a.similarityScore * 100)}%</td>
                      <td className="num">{fmtMoney(a.estRevenue)}</td>
                      <td className="num">{fmtNum(a.estDownloads)}</td>
                      <td className="num">{a.rating?.toFixed(1) ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <AgentView summary={result.agentSummary} data={result} source={result.source} label="Agent view · similar apps" />
          </>
        )}
      </div>
    </main>
  );
}
