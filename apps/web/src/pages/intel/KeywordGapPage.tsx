/* ============================================================
   Additive lane — Keyword Gap. /intel/keyword-gap

   "Which keywords do competitors rank top-10 for that I don't?"
   Subject app vs 1–10 competitors over the keyword inverse index,
   partitioned into gaps / shared / moat per market.
   ============================================================ */
import { useEffect, useState } from "react";
import type { AppListItem } from "@kittie/types";
import { EmptyState } from "../../components/EmptyState";
import { PageShell } from "../../components/PageShell";
import { Tabs } from "../../components/Tabs";
import {
  IconChevron,
  IconClose,
  IconDatabase,
  IconInfo,
  IconPlus,
  IconRank,
  IconSearch,
} from "../../icons";
import { listApps } from "../../lib/api";
import {
  fetchKeywordGap,
  type GapEntry,
  type GapResult,
  type IntelStore,
} from "../../lib/api/intel";
import type { Theme } from "../../lib/theme";
import "../../styles/intel.css";

const MAX_COMPETITORS = 10;

const COUNTRIES: { code: string; label: string }[] = [
  { code: "", label: "All countries" },
  { code: "us", label: "United States" },
  { code: "gb", label: "United Kingdom" },
  { code: "de", label: "Germany" },
  { code: "fr", label: "France" },
  { code: "es", label: "Spain" },
  { code: "it", label: "Italy" },
  { code: "nl", label: "Netherlands" },
  { code: "br", label: "Brazil" },
  { code: "mx", label: "Mexico" },
  { code: "jp", label: "Japan" },
  { code: "kr", label: "South Korea" },
  { code: "in", label: "India" },
  { code: "ca", label: "Canada" },
  { code: "au", label: "Australia" },
];

/* ---- compact debounced app search picker (local — no shared file allowed) ---- */
function AppPicker({
  placeholder,
  exclude,
  onPick,
  disabled,
}: {
  placeholder: string;
  exclude: string[];
  onPick: (app: AppListItem) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AppListItem[]>([]);
  const [searching, setSearching] = useState(false);

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

  return (
    <div className="intel-picker intel-grow">
      <div className="search">
        <IconSearch />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          spellCheck={false}
        />
      </div>
      {query.trim() && (
        <div className="intel-pick-results">
          {searching && <div className="intel-pick-note">Searching…</div>}
          {!searching && results.length === 0 && <div className="intel-pick-note">No apps found.</div>}
          {results.map((a) => (
            <button
              key={a.id}
              className="intel-pick-row"
              disabled={exclude.includes(a.id)}
              onClick={() => { onPick(a); setQuery(""); setResults([]); }}
            >
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
  );
}

function AppChip({ app, onRemove }: { app: AppListItem; onRemove: () => void }) {
  return (
    <span className="intel-chip">
      {app.iconUrl && <img src={app.iconUrl} alt="" />}
      {app.title}
      <button onClick={onRemove} aria-label={`Remove ${app.title}`}>
        <IconClose style={{ width: 12, height: 12 }} />
      </button>
    </span>
  );
}

function rankCell(rank: number | null): string {
  return rank === null ? "—" : `#${rank}`;
}

function GapTable({ entries, mode }: { entries: GapEntry[]; mode: "gaps" | "shared" | "moat" }) {
  if (entries.length === 0) {
    return (
      <div className="intel-pick-note">
        {mode === "gaps" && "No gaps in this slice — the subject covers every keyword its competitors rank top-10 for."}
        {mode === "shared" && "No contested keywords — subject and competitors never overlap inside the top 10 here."}
        {mode === "moat" && "No moat keywords — the subject holds no top-10 rank its competitors lack."}
      </div>
    );
  }
  return (
    <div className="intel-table-scroll">
      <table className="intel-table">
        <thead>
          <tr>
            <th>Keyword</th>
            <th>Market</th>
            <th className="num">Your rank</th>
            <th className="num">{mode === "moat" ? "Nearest competitor" : "Best competitor"}</th>
            <th className="num">Competitors in top 10</th>
            <th className="num">Opportunity</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={`${e.keywordId}-${e.country}-${e.store}`}>
              <td className="intel-kw">{e.keyword}</td>
              <td className="intel-market-cell">{e.country.toUpperCase()} · {e.store === "apple" ? "App Store" : "Google Play"}</td>
              <td className="num">{rankCell(e.subjectRank)}</td>
              <td className="num">{rankCell(e.bestCompetitorRank)}</td>
              <td className="num">{e.competitorCount}</td>
              <td className="num">
                <span className="intel-opp">
                  <span className="intel-bar"><span className="intel-bar-fill" style={{ width: `${Math.min(100, Math.max(2, e.opportunity))}%` }} /></span>
                  <span className="intel-opp-val">{Math.round(e.opportunity)}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function KeywordGapPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const [subject, setSubject] = useState<AppListItem | null>(null);
  const [competitors, setCompetitors] = useState<AppListItem[]>([]);
  const [country, setCountry] = useState("");
  const [store, setStore] = useState<"" | IntelStore>("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GapResult | null>(null);
  const [tab, setTab] = useState("gaps");

  const excluded = [subject?.id ?? "", ...competitors.map((c) => c.id)].filter(Boolean);
  const canRun = !!subject && competitors.length >= 1 && competitors.length <= MAX_COMPETITORS;

  function run() {
    if (!canRun || !subject || loading) return;
    setLoading(true);
    setError(null);
    fetchKeywordGap({
      subjectAppId: subject.id,
      competitorAppIds: competitors.map((c) => c.id),
      ...(country ? { country } : {}),
      ...(store ? { store } : {}),
    })
      .then((r) => { setResult(r); setTab("gaps"); })
      .catch((e) => setError(e instanceof Error ? e.message : "Analysis failed"))
      .finally(() => setLoading(false));
  }

  const isEmpty =
    result !== null &&
    result.gaps.length === 0 &&
    result.shared.length === 0 &&
    result.subjectOnly.length === 0;

  return (
    <PageShell
      icon={<IconRank style={{ width: 18, height: 18 }} />}
      title="Keyword Gap"
      sub="Keywords competitors rank top-10 for that you don't"
      theme={theme}
      onToggleTheme={onToggleTheme}
    >
      <div className="intel-wrap">
        <div className="intel-controls">
          <div className="intel-controls-row">
            <span className="intel-label">Your app</span>
            {subject ? (
              <div className="intel-chiplist">
                <AppChip app={subject} onRemove={() => setSubject(null)} />
              </div>
            ) : (
              <AppPicker placeholder="Search for your app…" exclude={excluded} onPick={setSubject} />
            )}
          </div>

          <div className="intel-controls-row">
            <span className="intel-label">Competitors</span>
            <div className="intel-grow">
              <AppPicker
                placeholder={competitors.length >= MAX_COMPETITORS ? `Limit of ${MAX_COMPETITORS} reached` : "Search competitors (1–10)…"}
                exclude={excluded}
                onPick={(a) => setCompetitors((prev) => (prev.length >= MAX_COMPETITORS ? prev : [...prev, a]))}
                disabled={competitors.length >= MAX_COMPETITORS}
              />
              {competitors.length > 0 && (
                <div className="intel-chiplist" style={{ marginTop: 8 }}>
                  {competitors.map((c) => (
                    <AppChip key={c.id} app={c} onRemove={() => setCompetitors((prev) => prev.filter((p) => p.id !== c.id))} />
                  ))}
                  <span className="intel-hint">{competitors.length}/{MAX_COMPETITORS}</span>
                </div>
              )}
            </div>
          </div>

          <div className="intel-controls-row">
            <span className="intel-label">Market</span>
            <div className="select">
              <select value={country} onChange={(e) => setCountry(e.target.value)}>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
              <IconChevron />
            </div>
            <div className="select">
              <select value={store} onChange={(e) => setStore(e.target.value as "" | IntelStore)}>
                <option value="">Both stores</option>
                <option value="apple">App Store</option>
                <option value="google">Google Play</option>
              </select>
              <IconChevron />
            </div>
            <div className="intel-spacer" />
            <button className="btn btn-accent" disabled={!canRun || loading} onClick={run}>
              {loading ? "Analyzing…" : "Find gaps"}
            </button>
          </div>
        </div>

        {error && (
          <div className="intel-error"><IconInfo style={{ width: 14, height: 14 }} /> {error}</div>
        )}

        {!result && !loading && !error && (
          <EmptyState
            icon={<IconRank />}
            title="Pick your app and its competitors"
            sub="The gap analysis partitions the keyword index into gaps to attack, contested ground, and the moat only you hold."
          />
        )}

        {isEmpty && (
          <EmptyState
            icon={<IconDatabase />}
            title="Keyword index is still seeding"
            sub="No ranking rows exist for these apps yet — run the corpus sweep to build the keyword index, then re-run. This is missing data, not the absence of gaps."
          />
        )}

        {result && !isEmpty && (
          <div className="intel-section">
            <Tabs
              items={[
                { id: "gaps", label: "Gaps", count: result.gaps.length },
                { id: "shared", label: "Shared", count: result.shared.length },
                { id: "moat", label: "Your moat", count: result.subjectOnly.length },
              ]}
              active={tab}
              onChange={setTab}
            />
            <div className="intel-tabpane">
              {tab === "gaps" && <GapTable entries={result.gaps} mode="gaps" />}
              {tab === "shared" && <GapTable entries={result.shared} mode="shared" />}
              {tab === "moat" && <GapTable entries={result.subjectOnly} mode="moat" />}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
