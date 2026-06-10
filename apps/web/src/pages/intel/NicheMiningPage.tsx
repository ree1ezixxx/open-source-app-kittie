/* ============================================================
   Additive lane — Niche Mining. /intel/niche-mining

   The Rodrigue thesis: 1–2★ reviews across a whole niche tell you
   what to build. Define the niche by category or hand-picked apps,
   mine the pre-tagged review corpus, and read the opportunity map —
   complaints first.
   ============================================================ */
import { useEffect, useMemo, useState } from "react";
import type { AppListItem } from "@kittie/types";
import { EmptyState } from "../../components/EmptyState";
import { PageShell } from "../../components/PageShell";
import {
  IconBulb,
  IconClose,
  IconHeart,
  IconInfo,
  IconMessage,
  IconPlus,
  IconSearch,
  IconSpark,
} from "../../icons";
import { listApps } from "../../lib/api";
import { mineNiche, type MinedCluster, type NicheReport } from "../../lib/api/intel";
import type { Theme } from "../../lib/theme";
import "../../styles/intel.css";

const MAX_PICKED = 20;

/** Static App Store category seed — merged with whatever the live data exposes. */
const SEED_CATEGORIES = [
  "Books", "Business", "Developer Tools", "Education", "Entertainment", "Finance",
  "Food & Drink", "Games", "Graphics & Design", "Health & Fitness", "Lifestyle",
  "Medical", "Music", "Navigation", "News", "Photo & Video", "Productivity",
  "Reference", "Shopping", "Social Networking", "Sports", "Travel", "Utilities", "Weather",
];

interface Section {
  kind: MinedCluster["kind"];
  title: string;
  sub: string;
  icon: typeof IconBulb;
}

/** Complaints lead — this is the 1–2★ opportunity map. */
const SECTIONS: Section[] = [
  { kind: "complaint", title: "Top complaints", sub: "What the niche is angry about — the 1–2★ opportunity map", icon: IconMessage },
  { kind: "request", title: "Top requests", sub: "Features users explicitly ask for", icon: IconBulb },
  { kind: "praise", title: "What users love", sub: "Table stakes — match these or lose by default", icon: IconHeart },
];

function ClusterCard({ cluster, rank, maxScore }: { cluster: MinedCluster; rank: number; maxScore: number }) {
  const pct = maxScore > 0 ? Math.max(4, Math.round((cluster.score / maxScore) * 100)) : 0;
  return (
    <div className="intel-cluster">
      <div className="intel-cluster-top">
        <span className="intel-cluster-rank">#{rank}</span>
        <span className="intel-cluster-label" title={cluster.label}>{cluster.label}</span>
      </div>
      <div className="intel-cluster-meta">
        <span><strong>{cluster.count.toLocaleString()}</strong> reviews</span>
        <span className="intel-dot" />
        <span><strong>{cluster.appCount}</strong> {cluster.appCount === 1 ? "app" : "apps"}</span>
        <span className="intel-dot" />
        <span>{(cluster.share * 100).toFixed(1)}% share</span>
        <span className="intel-dot" />
        <span>{cluster.avgRating.toFixed(1)} ★ avg</span>
      </div>
      <div className="intel-bar" title={`Score ${cluster.score.toFixed(1)}`}>
        <span className="intel-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function NicheMiningPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const [mode, setMode] = useState<"category" | "apps">("category");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>(SEED_CATEGORIES);

  // hand-picked apps
  const [picked, setPicked] = useState<AppListItem[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AppListItem[]>([]);
  const [searching, setSearching] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<NicheReport | null>(null);

  // Merge live categories from the tracked corpus into the datalist seed.
  useEffect(() => {
    const ctrl = new AbortController();
    listApps({ limit: 100 }, ctrl.signal)
      .then((res) => {
        const live = res.data.map((a) => a.category).filter((c): c is string => !!c);
        setCategories((prev) => [...new Set([...prev, ...live])].sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => { /* seed list is enough */ });
    return () => ctrl.abort();
  }, []);

  // Debounced app search for the picker.
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      listApps({ search: q, limit: 8 }, ctrl.signal)
        .then((res) => setResults(res.data))
        .catch(() => { /* aborted or down — dropdown just stays empty */ })
        .finally(() => setSearching(false));
    }, 260);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  function addApp(a: AppListItem) {
    setPicked((prev) =>
      prev.some((p) => p.id === a.id) || prev.length >= MAX_PICKED ? prev : [...prev, a],
    );
    setQuery("");
    setResults([]);
  }

  const canRun = mode === "category" ? category.trim().length > 0 : picked.length > 0;

  function run() {
    if (!canRun || loading) return;
    setLoading(true);
    setError(null);
    const params =
      mode === "category"
        ? { category: category.trim() }
        : { appIds: picked.map((a) => a.id) };
    mineNiche(params)
      .then(setReport)
      .catch((e) => setError(e instanceof Error ? e.message : "Mining failed"))
      .finally(() => setLoading(false));
  }

  const byKind = useMemo(() => {
    const map: Record<MinedCluster["kind"], MinedCluster[]> = { complaint: [], request: [], praise: [] };
    for (const c of report?.clusters ?? []) map[c.kind].push(c);
    for (const k of Object.keys(map) as MinedCluster["kind"][]) {
      map[k].sort((a, b) => b.score - a.score);
    }
    return map;
  }, [report]);

  return (
    <PageShell
      icon={<IconSpark style={{ width: 18, height: 18 }} />}
      title="Niche Mining"
      sub="Mine tagged reviews across a niche — complaints are the build list"
      theme={theme}
      onToggleTheme={onToggleTheme}
    >
      <div className="intel-wrap">
        {/* ---- define the niche ---- */}
        <div className="intel-controls">
          <div className="intel-controls-row">
            <span className="intel-label">Niche</span>
            <div className="segmented">
              <button className={mode === "category" ? "on" : ""} onClick={() => setMode("category")}>By category</button>
              <button className={mode === "apps" ? "on" : ""} onClick={() => setMode("apps")}>Hand-picked apps</button>
            </div>
            <div className="intel-spacer" />
            <button className="btn btn-accent" disabled={!canRun || loading} onClick={run}>
              {loading ? "Mining…" : "Mine reviews"}
            </button>
          </div>

          {mode === "category" ? (
            <div className="intel-controls-row">
              <div className="search intel-grow">
                <IconSearch />
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") run(); }}
                  placeholder="Category — e.g. Health & Fitness"
                  list="intel-categories"
                  spellCheck={false}
                />
              </div>
              <datalist id="intel-categories">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
          ) : (
            <>
              <div className="intel-controls-row">
                <div className="intel-picker intel-grow">
                  <div className="search">
                    <IconSearch />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={picked.length >= MAX_PICKED ? `Limit of ${MAX_PICKED} apps reached` : "Search apps to add to the niche…"}
                      disabled={picked.length >= MAX_PICKED}
                      spellCheck={false}
                    />
                  </div>
                  {query.trim() && (
                    <div className="intel-pick-results">
                      {searching && <div className="intel-pick-note">Searching…</div>}
                      {!searching && results.length === 0 && <div className="intel-pick-note">No apps found.</div>}
                      {results.map((a) => (
                        <button key={a.id} className="intel-pick-row" onClick={() => addApp(a)} disabled={picked.some((p) => p.id === a.id)}>
                          {a.iconUrl
                            ? <img className="intel-pick-icon" src={a.iconUrl} alt="" />
                            : <span className="intel-pick-icon intel-pick-icon-ph">{a.title.slice(0, 1)}</span>}
                          <span className="intel-pick-meta">
                            <span className="t">{a.title}</span>
                            <span className="s">{a.developer}{a.category ? ` · ${a.category}` : ""}</span>
                          </span>
                          <IconPlus style={{ width: 14, height: 14 }} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {picked.length > 0 && (
                <div className="intel-chiplist">
                  {picked.map((a) => (
                    <span key={a.id} className="intel-chip">
                      {a.iconUrl && <img src={a.iconUrl} alt="" />}
                      {a.title}
                      <button onClick={() => setPicked((prev) => prev.filter((p) => p.id !== a.id))} aria-label={`Remove ${a.title}`}>
                        <IconClose style={{ width: 12, height: 12 }} />
                      </button>
                    </span>
                  ))}
                  <span className="intel-hint">{picked.length}/{MAX_PICKED}</span>
                </div>
              )}
            </>
          )}
        </div>

        {error && (
          <div className="intel-error"><IconInfo style={{ width: 14, height: 14 }} /> {error}</div>
        )}

        {/* ---- results ---- */}
        {!report && !loading && !error && (
          <EmptyState
            icon={<IconSpark />}
            title="Define a niche to mine"
            sub="Pick a category or a set of apps, then mine the tagged review corpus for recurring complaints, requests and praise."
          />
        )}

        {report && report.totalReviews === 0 && (
          <EmptyState
            icon={<IconInfo />}
            title="No tagged reviews for this niche"
            sub="Reviews are tagged at ingest — this niche has no classified reviews in the corpus yet. Sync reviews for these apps first, then mine again."
          />
        )}

        {report && report.totalReviews > 0 && (
          <>
            <div className="intel-summary">
              <strong>{report.totalReviews.toLocaleString()}</strong>&nbsp;tagged reviews across&nbsp;
              <strong>{report.appCount.toLocaleString()}</strong>&nbsp;{report.appCount === 1 ? "app" : "apps"}
              <span className="intel-dot" />
              {report.clusters.length} themes mined
            </div>

            {SECTIONS.map((s) => {
              const clusters = byKind[s.kind];
              const Icon = s.icon;
              const maxScore = clusters[0]?.score ?? 0;
              return (
                <section className="intel-section" key={s.kind}>
                  <div className="intel-section-head">
                    <div className="intel-section-icon"><Icon style={{ width: 15, height: 15 }} /></div>
                    <div>
                      <div className="intel-section-title">{s.title} {clusters.length > 0 && <span className="count-chip">{clusters.length}</span>}</div>
                      <div className="intel-section-sub">{s.sub}</div>
                    </div>
                  </div>
                  {clusters.length === 0 ? (
                    <div className="intel-pick-note">No {s.kind === "praise" ? "praise" : `${s.kind}s`} surfaced in this niche's tagged reviews.</div>
                  ) : (
                    <div className="intel-cluster-grid">
                      {clusters.map((c, i) => (
                        <ClusterCard key={`${c.kind}-${c.label}`} cluster={c} rank={i + 1} maxScore={maxScore} />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </>
        )}
      </div>
    </PageShell>
  );
}
