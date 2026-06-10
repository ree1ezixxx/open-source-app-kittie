/* ============================================================
   Additive lane — Localization Gap. /intel/localization-gap

   Cross-market openings: keywords that are valuable yet under-
   occupied per country, plus a presence matrix (apps × countries)
   when specific apps are picked.
   ============================================================ */
import { useEffect, useMemo, useState } from "react";
import type { AppListItem } from "@kittie/types";
import { EmptyState } from "../../components/EmptyState";
import { PageShell } from "../../components/PageShell";
import {
  IconChevron,
  IconClose,
  IconDatabase,
  IconGlobe,
  IconInfo,
  IconPlus,
  IconSearch,
} from "../../icons";
import { listApps } from "../../lib/api";
import {
  fetchLocalizationGap,
  type IntelStore,
  type LocalizationGapResult,
  type MarketGapReport,
} from "../../lib/api/intel";
import type { Theme } from "../../lib/theme";
import "../../styles/intel.css";

const MAX_PICKED = 10;
const OPENINGS_SHOWN = 8;

function fmtScore(v: number | null): string {
  return v === null ? "—" : String(Math.round(v));
}

function MarketCard({ market }: { market: MarketGapReport }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? market.openings : market.openings.slice(0, OPENINGS_SHOWN);
  return (
    <div className="intel-market">
      <div className="intel-market-head">
        <span className="intel-market-code">{market.country.toUpperCase()}</span>
        <span className="intel-market-stats">
          <strong>{market.openings.length.toLocaleString()}</strong> openings
          <span className="intel-dot" />
          {market.totalKeywords.toLocaleString()} keywords indexed
        </span>
      </div>
      <table className="intel-table intel-table-compact">
        <thead>
          <tr>
            <th>Keyword</th>
            <th className="num">Popularity</th>
            <th className="num">Difficulty</th>
            <th className="num">Occupants</th>
            <th className="num">Opportunity</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((o) => (
            <tr key={o.keywordId}>
              <td className="intel-kw">{o.keyword}</td>
              <td className="num">{fmtScore(o.popularity)}</td>
              <td className="num">{fmtScore(o.difficulty)}</td>
              <td className="num">{o.occupantCount}</td>
              <td className="num">
                <span className="intel-opp">
                  <span className="intel-bar"><span className="intel-bar-fill" style={{ width: `${Math.min(100, Math.max(2, o.opportunity))}%` }} /></span>
                  <span className="intel-opp-val">{Math.round(o.opportunity)}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {market.openings.length > OPENINGS_SHOWN && (
        <button className="intel-more" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show fewer" : `Show all ${market.openings.length}`}
        </button>
      )}
    </div>
  );
}

export function LocalizationGapPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const [picked, setPicked] = useState<AppListItem[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AppListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [store, setStore] = useState<"" | IntelStore>("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LocalizationGapResult | null>(null);

  // Debounced app search for the optional presence picker.
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      listApps({ search: q, limit: 8 }, ctrl.signal)
        .then((res) => setResults(res.data))
        .catch(() => { /* aborted or down — dropdown stays empty */ })
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

  function run() {
    if (loading) return;
    setLoading(true);
    setError(null);
    fetchLocalizationGap({
      ...(picked.length > 0 ? { appIds: picked.map((a) => a.id) } : {}),
      ...(store ? { store } : {}),
    })
      .then(setResult)
      .catch((e) => setError(e instanceof Error ? e.message : "Analysis failed"))
      .finally(() => setLoading(false));
  }

  const markets = useMemo(
    () => (result ? [...result.markets].sort((a, b) => b.openings.length - a.openings.length) : []),
    [result],
  );

  // Presence matrix scaffolding: union of countries, heat scaled to the max cell.
  const presenceCountries = useMemo(() => {
    const set = new Set<string>();
    for (const p of result?.presence ?? []) for (const c of Object.keys(p.byCountry)) set.add(c);
    return [...set].sort();
  }, [result]);

  const presenceMax = useMemo(() => {
    let max = 0;
    for (const p of result?.presence ?? []) for (const v of Object.values(p.byCountry)) max = Math.max(max, v);
    return max;
  }, [result]);

  const titleOf = (appId: string): string => picked.find((p) => p.id === appId)?.title ?? appId;

  return (
    <PageShell
      icon={<IconGlobe style={{ width: 18, height: 18 }} />}
      title="Localization Gap"
      sub="Valuable, under-occupied keywords per market — room to localize into"
      theme={theme}
      onToggleTheme={onToggleTheme}
    >
      <div className="intel-wrap">
        <div className="intel-controls">
          <div className="intel-controls-row">
            <span className="intel-label">Apps</span>
            <div className="intel-picker intel-grow">
              <div className="search">
                <IconSearch />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={picked.length >= MAX_PICKED ? `Limit of ${MAX_PICKED} apps reached` : "Optional — pick apps to see their market presence…"}
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
            <div className="select">
              <select value={store} onChange={(e) => setStore(e.target.value as "" | IntelStore)}>
                <option value="">Both stores</option>
                <option value="apple">App Store</option>
                <option value="google">Google Play</option>
              </select>
              <IconChevron />
            </div>
            <button className="btn btn-accent" disabled={loading} onClick={run}>
              {loading ? "Scanning…" : "Scan markets"}
            </button>
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
        </div>

        {error && (
          <div className="intel-error"><IconInfo style={{ width: 14, height: 14 }} /> {error}</div>
        )}

        {!result && !loading && !error && (
          <EmptyState
            icon={<IconGlobe />}
            title="Scan markets for localization openings"
            sub="Runs across the whole keyword index. Optionally pick apps first to overlay their per-country keyword presence."
          />
        )}

        {result && markets.length === 0 && (
          <EmptyState
            icon={<IconDatabase />}
            title="Keyword index is still seeding"
            sub="No market data exists yet — run the corpus sweep to build the multi-market keyword index, then scan again. This is missing data, not the absence of openings."
          />
        )}

        {markets.length > 0 && (
          <>
            {result && result.presence.length > 0 && presenceCountries.length > 0 && (
              <section className="intel-section">
                <div className="intel-section-head">
                  <div>
                    <div className="intel-section-title">Market presence</div>
                    <div className="intel-section-sub">Top-10 keyword count per app per country — dark cells are uncovered markets</div>
                  </div>
                </div>
                <div className="intel-table-scroll">
                  <table className="intel-table intel-matrix">
                    <thead>
                      <tr>
                        <th>App</th>
                        {presenceCountries.map((c) => <th key={c} className="num">{c.toUpperCase()}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {result.presence.map((p) => (
                        <tr key={p.appId}>
                          <td className="intel-kw">{titleOf(p.appId)}</td>
                          {presenceCountries.map((c) => {
                            const v = p.byCountry[c] ?? 0;
                            const heat = presenceMax > 0 ? v / presenceMax : 0;
                            return (
                              <td
                                key={c}
                                className="num intel-heat"
                                style={{ backgroundColor: `color-mix(in srgb, var(--accent) ${Math.round(heat * 40)}%, transparent)` }}
                              >
                                {v || "·"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section className="intel-section">
              <div className="intel-section-head">
                <div>
                  <div className="intel-section-title">
                    Openings by market <span className="count-chip">{markets.length}</span>
                  </div>
                  <div className="intel-section-sub">Popularity ≥ 40, difficulty ≤ 60, fewer than 3 occupants in the top 10</div>
                </div>
              </div>
              <div className="intel-market-grid">
                {markets.map((m) => <MarketCard key={m.country} market={m} />)}
              </div>
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}
