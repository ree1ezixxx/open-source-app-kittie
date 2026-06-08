// Lane B — related-keyword ideas table (the generator output).
import { Fragment, useMemo, useState } from "react";
import type { Store } from "@kittie/types";
import { IconChevron, IconSpark } from "../../icons";
import { AppAvatar, OpportunityBadge } from "./KeywordBits";
import { fetchKeywordMarkets, type KeywordDifficulty, type KeywordMarket } from "../../lib/api/keywords";
import { MARKETS, flagOf, market } from "../../lib/markets";

type SortKey = "opportunity" | "popularity" | "difficulty";
type Filter = "all" | "opp" | "lowdiff" | "tracked";

const keyOf = (k: { store: Store; keyword: string }) => `${k.store}:${k.keyword.toLowerCase()}`;
const clamp = (v: number) => Math.max(0, Math.min(100, v));

function range(values: number[]): string {
  if (values.length === 0) return "—";
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return lo === hi ? `${lo}` : `${lo}–${hi}`;
}

/** AppKittie-style min–max band across the current ideas. */
function StatsBand({ ideas }: { ideas: KeywordDifficulty[] }) {
  const stats: [string, string][] = [
    ["Opportunity", range(ideas.map((k) => k.opportunityScore))],
    ["Popularity", range(ideas.map((k) => k.popularity))],
    ["Difficulty", range(ideas.map((k) => k.difficulty))],
    ["Ranking apps", range(ideas.map((k) => k.competingAppCount))],
  ];
  return (
    <div className="kw-ideas-stats">
      {stats.map(([label, val]) => (
        <div className="kw-ideas-stat" key={label}>
          <div className="kw-ideas-stat-label">{label}</div>
          <div className="kw-ideas-stat-val">{val}</div>
          <div className="kw-ideas-stat-sub">across {ideas.length} keywords</div>
        </div>
      ))}
    </div>
  );
}

function diffColor(value: number): string {
  if (value <= 30) return "var(--positive)";
  if (value <= 60) return "#f5c451";
  return "var(--danger)";
}

/** Number + thin proportional bar, AppKittie-style. */
function CellMeter({ value, kind }: { value: number; kind: "popularity" | "difficulty" }) {
  const color = kind === "difficulty" ? diffColor(value) : "var(--accent)";
  return (
    <div className="kw-cellmeter">
      <span className="kw-cellmeter-n" style={kind === "difficulty" ? { color } : undefined}>{value}</span>
      <span className="kw-cellmeter-track">
        <span className="kw-cellmeter-fill" style={{ width: `${clamp(value)}%`, background: color }} />
      </span>
    </div>
  );
}

/** Up to 5 ranking-app icons, stacked. */
function AppStack({ apps }: { apps: KeywordDifficulty["topApps"] }) {
  if (apps.length === 0) return <span className="kw-appstack-empty">—</span>;
  const shown = apps.slice(0, 5);
  return (
    <div className="kw-appstack">
      {shown.map((a) => (
        <span className="kw-appstack-icon" key={`${a.rank}-${a.title}`} title={a.title}>
          <AppAvatar title={a.title} iconUrl={a.iconUrl} />
        </span>
      ))}
      {apps.length > 5 && <span className="kw-appstack-more">+{apps.length - 5}</span>}
    </div>
  );
}

type MarketState = "loading" | "error" | KeywordMarket[];

export function IdeasTable({
  seed,
  store,
  country,
  ideas,
  trackedKeys,
  onTrack,
  onClear,
}: {
  seed: string;
  store: Store;
  country: string;
  ideas: KeywordDifficulty[];
  trackedKeys: Set<string>;
  onTrack: (kd: KeywordDifficulty) => void;
  onClear?: () => void;
}) {
  const [sort, setSort] = useState<SortKey>("opportunity");
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [markets, setMarkets] = useState<Record<string, MarketState>>({});

  // Expand a row; lazily fetch the keyword's cross-market metrics on first open.
  const toggle = (kd: KeywordDifficulty) => {
    const key = keyOf(kd);
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    if (markets[key] === undefined) {
      setMarkets((m) => ({ ...m, [key]: "loading" }));
      fetchKeywordMarkets(kd.keyword, store)
        .then((data) => setMarkets((m) => ({ ...m, [key]: data })))
        .catch(() => setMarkets((m) => ({ ...m, [key]: "error" })));
    }
  };

  const rows = useMemo(() => {
    let list = ideas;
    if (filter === "opp") list = list.filter((k) => k.opportunityScore >= 45);
    else if (filter === "lowdiff") list = list.filter((k) => k.difficulty <= 30);
    else if (filter === "tracked") list = list.filter((k) => trackedKeys.has(keyOf(k)));
    return [...list].sort((a, b) => {
      if (sort === "popularity") return b.popularity - a.popularity;
      if (sort === "difficulty") return a.difficulty - b.difficulty;
      return b.opportunityScore - a.opportunityScore;
    });
  }, [ideas, sort, filter, trackedKeys]);

  const counts = useMemo(
    () => ({
      all: ideas.length,
      opp: ideas.filter((k) => k.opportunityScore >= 45).length,
      lowdiff: ideas.filter((k) => k.difficulty <= 30).length,
      tracked: ideas.filter((k) => trackedKeys.has(keyOf(k))).length,
    }),
    [ideas, trackedKeys],
  );

  // Copy the currently-visible keywords (post-filter/sort) to the clipboard.
  const copyVisible = () => {
    void navigator.clipboard?.writeText(rows.map((k) => k.keyword).join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };

  // Export the full idea set for this seed as CSV.
  const exportCsv = () => {
    const header = ["keyword", "opportunity", "popularity", "difficulty", "traffic", "competing_apps"];
    const lines = rows.map((k) =>
      [k.keyword, k.opportunityScore, k.popularity, k.difficulty, k.trafficScore, k.competingAppCount]
        .map((v) => (typeof v === "string" && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v))
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `keywords-${seed.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="kw-ideas">
      <div className="section-head" style={{ margin: "30px 0 10px" }}>
        <div className="section-label" style={{ margin: 0 }}>
          Related ideas for “{seed}”
        </div>
        <span className="section-count">{ideas.length} found</span>
        {ideas.length > 0 && (
          <div className="kw-ideas-toolbar">
            <button className="kw-ideas-tool" onClick={copyVisible} title="Copy visible keywords">
              {copied ? "✓ Copied" : "Copy"}
            </button>
            <button className="kw-ideas-tool" onClick={exportCsv} title="Export keyword data (CSV)">Export</button>
            {onClear && (
              <button className="kw-ideas-tool" onClick={onClear} title="Clear these ideas">Clear</button>
            )}
          </div>
        )}
      </div>

      {ideas.length > 0 && <StatsBand ideas={ideas} />}

      {ideas.length === 0 ? (
        <div className="aso-empty">
          <IconSpark />
          <div className="t">No related ideas surfaced</div>
          <div className="s">This seed was too specific for the store to expand. Try a broader term.</div>
        </div>
      ) : (
        <>
          <div className="kw-ideas-filters">
            {([
              ["all", "Ideas"],
              ["opp", "Opportunities"],
              ["lowdiff", "Low difficulty"],
              ["tracked", "Tracked"],
            ] as [Filter, string][]).map(([id, label]) => (
              <button
                key={id}
                className={`kw-ideas-filter ${filter === id ? "on" : ""}`}
                onClick={() => setFilter(id)}
              >
                {label} <span className="n">{counts[id]}</span>
              </button>
            ))}
          </div>

          <div className="kw-ideas-scroll">
          <table className="kw-ideas-table">
            <thead>
              <tr>
                <th>Keyword</th>
                <Sortable label="Opp" col="opportunity" sort={sort} setSort={setSort} />
                <Sortable label="Popularity" col="popularity" sort={sort} setSort={setSort} />
                <Sortable label="Difficulty" col="difficulty" sort={sort} setSort={setSort} />
                <th className="kw-ideas-appshead">Apps</th>
                <th aria-label="action" />
              </tr>
            </thead>
            <tbody>
              {rows.map((kd) => {
                const key = keyOf(kd);
                const tracked = trackedKeys.has(key);
                const isOpen = expanded.has(key);
                return (
                  <Fragment key={key}>
                    <tr className={isOpen ? "open" : ""}>
                      <td className="kw-ideas-name">
                        <span className="kw-ideas-flag">{flagOf(country)}</span>
                        {kd.keyword}
                      </td>
                      <td><OpportunityBadge score={kd.opportunityScore} /></td>
                      <td className="kw-ideas-meter"><CellMeter value={kd.popularity} kind="popularity" /></td>
                      <td className="kw-ideas-meter"><CellMeter value={kd.difficulty} kind="difficulty" /></td>
                      <td><AppStack apps={kd.topApps} /></td>
                      <td className="kw-ideas-action">
                        {tracked ? (
                          <span className="kw-ideas-tracked">Tracked</span>
                        ) : (
                          <button className="kw-ideas-track" onClick={() => onTrack(kd)} title="Track keyword">+</button>
                        )}
                        <button
                          className={`kw-ideas-expand ${isOpen ? "open" : ""}`}
                          onClick={() => toggle(kd)}
                          aria-label={isOpen ? "Collapse" : "Expand"}
                          aria-expanded={isOpen}
                        >
                          <IconChevron />
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="kw-ideas-subrow">
                        <td colSpan={6}>
                          <MarketsPanel keyword={kd.keyword} current={country} state={markets[key]} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        </>
      )}
    </div>
  );
}

const UNTAPPED = (m: KeywordMarket) => m.popularity >= 60 && m.difficulty <= 50;
const diffBucket = (v: number) => (v <= 30 ? "Easy" : v <= 60 ? "Medium" : "Hard");

/** Cross-market opportunity finder — the same keyword scored across every market. */
function MarketsPanel({
  keyword,
  current,
  state,
}: {
  keyword: string;
  current: string;
  state: MarketState | undefined;
}) {
  if (state === undefined || state === "loading") {
    return (
      <div className="kw-markets loading">
        <span className="aso-spin" /> Scanning {MARKETS.length} markets for “{keyword}”…
      </div>
    );
  }
  if (state === "error") {
    return <div className="kw-markets error">Couldn’t load cross-market data. Try again.</div>;
  }

  const rows = [...state].sort((a, b) => b.opportunityScore - a.opportunityScore);
  const untapped = rows.filter(UNTAPPED).length;

  return (
    <div className="kw-markets">
      <div className="kw-markets-head">
        <span className="kw-markets-title">Metrics across markets for “{keyword}”</span>
        <span className="kw-markets-sub">
          {rows.length} markets
          {untapped > 0 && <> · <strong>{untapped} untapped {untapped === 1 ? "opportunity" : "opportunities"}</strong></>}
        </span>
      </div>
      <table className="kw-markets-table">
        <thead>
          <tr>
            <th>Country</th>
            <th>Popularity</th>
            <th>Difficulty</th>
            <th className="num">Apps</th>
            <th className="num">Opp</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const isCurrent = m.country === current.toUpperCase();
            const opp = UNTAPPED(m);
            return (
              <tr key={m.country} className={`${isCurrent ? "current" : ""} ${opp ? "opp" : ""}`}>
                <td className="kw-markets-country">
                  <span className="kw-ideas-flag">{flagOf(m.country)}</span>
                  {market(m.country).name}
                  {isCurrent && <span className="kw-markets-tag">current</span>}
                  {opp && !isCurrent && <span className="kw-markets-tag opp">OPP</span>}
                </td>
                <td className="kw-ideas-meter"><CellMeter value={m.popularity} kind="popularity" /></td>
                <td className="kw-ideas-meter">
                  <CellMeter value={m.difficulty} kind="difficulty" />
                  <span className="kw-markets-bucket">{diffBucket(m.difficulty)}</span>
                </td>
                <td className="num dim">{m.competingAppCount}</td>
                <td className="num"><OpportunityBadge score={m.opportunityScore} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Sortable({
  label,
  col,
  sort,
  setSort,
}: {
  label: string;
  col: SortKey;
  sort: SortKey;
  setSort: (s: SortKey) => void;
}) {
  return (
    <th className={`sortable ${sort === col ? "on" : ""}`} onClick={() => setSort(col)}>
      {label}
      <span className="sort-caret">{sort === col ? "▾" : ""}</span>
    </th>
  );
}
