import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Store } from "@kittie/types";
import { IconApple, IconChevron, IconClose, IconGooglePlay, IconInfo, IconMoon, IconSearch, IconSun } from "../../icons";
import { IconKey, IconLayers } from "../../components/aso/icons";
import { KeywordDetail, PendingCard } from "../../components/aso/KeywordBits";
import { IdeasTable } from "../../components/aso/IdeasTable";
import { GenerateModal, type GenState } from "../../components/aso/GenerateModal";
import { MarketsModal } from "../../components/aso/MarketsModal";
import {
  compareKeywords,
  fetchRelated,
  fetchTracked,
  lookupKeyword,
  streamKeywordMarkets,
  trackKeyword,
  untrackKeyword,
  type KeywordDifficulty,
  type KeywordMarket,
  type TrackedKeyword,
} from "../../lib/api/keywords";
import { MARKETS, MARKET_COUNT, market } from "../../lib/markets";
import type { Theme } from "../../lib/theme";
import "../../styles/aso.css";

type Tab = "all" | "opp" | "lowdiff" | "tracked" | "pending";
type Sort =
  | "newest"
  | "opportunity"
  | "most-difficult"
  | "least-difficult"
  | "most-popular"
  | "least-popular";

// Mirrors AppKittie's keyword-workspace sort menu.
const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "opportunity", label: "Best opportunity" },
  { value: "most-difficult", label: "Most difficult" },
  { value: "least-difficult", label: "Least difficult" },
  { value: "most-popular", label: "Most popular" },
  { value: "least-popular", label: "Least popular" },
];

const SORTERS: Record<Sort, ((a: KeywordDifficulty, b: KeywordDifficulty) => number) | null> = {
  newest: null, // results are kept newest-first by insertion order
  opportunity: (a, b) => b.opportunityScore - a.opportunityScore,
  "most-difficult": (a, b) => b.difficulty - a.difficulty,
  "least-difficult": (a, b) => a.difficulty - b.difficulty,
  "most-popular": (a, b) => b.popularity - a.popularity,
  "least-popular": (a, b) => a.popularity - b.popularity,
};

const keyOf = (kd: { store: Store; keyword: string }) => `${kd.store}:${kd.keyword.toLowerCase()}`;

function parseTerms(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,]+/)) {
    const t = part.trim();
    if (!t) continue;
    const low = t.toLowerCase();
    if (seen.has(low)) continue;
    seen.add(low);
    out.push(t);
  }
  return out.slice(0, 10);
}

export function KeywordExplorerPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const [sp, setSp] = useSearchParams();

  const [store, setStore] = useState<Store>("apple");
  const [country, setCountry] = useState("US");
  const [input, setInput] = useState("");
  const [results, setResults] = useState<KeywordDifficulty[]>([]);
  const [ideas, setIdeas] = useState<Record<string, KeywordDifficulty[]>>({});
  const [pending, setPending] = useState<string[]>([]);
  const [gen, setGen] = useState<GenState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // Durable shortlist, server-persisted — keyed by keyOf. See ADR 0003.
  const [tracked, setTracked] = useState<Map<string, TrackedKeyword>>(new Map());
  const [refreshing, setRefreshing] = useState(false);
  // Store + Markets modal (live-parity Explore flow) + streamed market fills.
  const [marketsModal, setMarketsModal] = useState<string[] | null>(null);
  const [liveMarkets, setLiveMarkets] = useState<Record<string, KeywordMarket[]>>({});
  const [marketsProgress, setMarketsProgress] = useState<Record<string, { done: number; total: number } | "done">>({});
  const streamCancel = useRef<(() => void) | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Batch compare (2–10 pasted terms) — no idea generation.
  const runCompare = useCallback(
    async (terms: string[], forStore: Store, forCountry: string) => {
      if (terms.length === 0) return;
      setError(null);
      setPending((p) => [...new Set([...terms, ...p])]);
      try {
        const fetched = await compareKeywords(terms.map((keyword) => ({ keyword, store: forStore })), forCountry);
        if (!mounted.current) return;
        setResults((prev) => {
          const incoming = new Map(fetched.map((f) => [keyOf(f), f]));
          const kept = prev.filter((r) => !incoming.has(keyOf(r)));
          return [...fetched, ...kept];
        });
        if (fetched[0]) setSelectedKey(keyOf(fetched[0]));
        setTab("all");
      } catch (e) {
        if (mounted.current) setError(e instanceof Error ? e.message : "Lookup failed");
      } finally {
        if (mounted.current) {
          const done = new Set(terms.map((t) => t.toLowerCase()));
          setPending((p) => p.filter((t) => !done.has(t.toLowerCase())));
        }
      }
    },
    [],
  );

  // Single seed → score it, discover related ideas, score those (staged progress modal).
  const generate = useCallback(
    async (seed: string, forStore: Store, forCountry: string) => {
      setError(null);
      setGen({ seed, stage: 0, done: 0, total: 0 });
      setPending((p) => [...new Set([seed, ...p])]);
      try {
        const seedKd = await lookupKeyword(seed, forStore, forCountry);
        if (!mounted.current) return;
        const seedKey = keyOf(seedKd);
        setResults((prev) => [seedKd, ...prev.filter((r) => keyOf(r) !== seedKey)]);
        setSelectedKey(seedKey);
        setTab("all");

        setGen((g) => (g ? { ...g, stage: 1 } : g));
        const related = await fetchRelated(seed, forStore, forCountry);
        if (!mounted.current) return;

        setGen((g) => (g ? { ...g, stage: 2, total: related.length, done: 0 } : g));
        const scored: KeywordDifficulty[] = [];
        for (let i = 0; i < related.length; i += 5) {
          const chunk = related.slice(i, i + 5).map((keyword) => ({ keyword, store: forStore }));
          const part = await compareKeywords(chunk, forCountry);
          if (!mounted.current) return;
          scored.push(...part);
          setGen((g) => (g ? { ...g, done: scored.length } : g));
        }

        setGen((g) => (g ? { ...g, stage: 3 } : g));
        scored.sort((a, b) => b.opportunityScore - a.opportunityScore);
        setIdeas((prev) => ({ ...prev, [seedKey]: scored }));
      } catch (e) {
        if (mounted.current) setError(e instanceof Error ? e.message : "Generation failed");
      } finally {
        if (mounted.current) {
          setPending((p) => p.filter((t) => t.toLowerCase() !== seed.toLowerCase()));
          setGen(null);
        }
      }
    },
    [],
  );

  const explore = useCallback(
    (terms: string[], forStore: Store, forCountry: string) => {
      if (terms.length === 0) return;
      if (terms.length === 1) void generate(terms[0]!, forStore, forCountry);
      else void runCompare(terms, forStore, forCountry);
    },
    [generate, runCompare],
  );

  function submit() {
    const terms = parseTerms(input);
    if (terms.length === 0) return;
    setMarketsModal(terms); // Store + Markets modal first — live-parity flow
  }

  /** Modal confirm: explore on the primary market, stream the rest live. */
  const startExplore = useCallback(
    (terms: string[], forStore: Store, countries: string[]) => {
      const primary = countries.includes(country) ? country : countries[0]!;
      setMarketsModal(null);
      setInput("");
      setStore(forStore);
      setCountry(primary);
      explore(terms, forStore, primary);

      // Multi-market: per-market analysis streams in the background and the
      // Markets card fills live. The keyword itself is already Pending above.
      if (countries.length > 1 && terms.length === 1) {
        const seed = terms[0]!;
        const key = `${forStore}:${seed.toLowerCase()}`;
        streamCancel.current?.();
        setLiveMarkets((m) => ({ ...m, [key]: [] }));
        setMarketsProgress((p) => ({ ...p, [key]: { done: 0, total: countries.length } }));
        streamCancel.current = streamKeywordMarkets(seed, forStore, countries, {
          onMarket: (m) => {
            if (!mounted.current) return;
            setLiveMarkets((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), m] }));
            setMarketsProgress((p) => ({ ...p, [key]: { done: m.done, total: m.total } }));
          },
          onDone: () => mounted.current && setMarketsProgress((p) => ({ ...p, [key]: "done" })),
          onError: () => mounted.current && setMarketsProgress((p) => ({ ...p, [key]: "done" })),
        });
      }
    },
    [country, explore],
  );

  useEffect(() => () => streamCancel.current?.(), []);

  // Deep link: /dashboard/aso/keywords?q=term → immediate explore.
  const didDeepLink = useRef(false);
  useEffect(() => {
    if (didDeepLink.current) return;
    const q = sp.get("q");
    if (q) {
      didDeepLink.current = true;
      const next = new URLSearchParams(sp);
      next.delete("q");
      setSp(next, { replace: true });
      explore(parseTerms(q), store, country);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On mount, restore the durable tracked shortlist from the server (survives reload).
  useEffect(() => {
    let alive = true;
    fetchTracked()
      .then((list) => {
        if (!alive) return;
        setTracked(new Map(list.map((t) => [keyOf(t), t])));
        const restored = list.map((t) => t.metrics).filter((m): m is KeywordDifficulty => m != null);
        if (restored.length) {
          setResults((prev) => {
            const have = new Set(prev.map(keyOf));
            return [...prev, ...restored.filter((r) => !have.has(keyOf(r)))];
          });
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const trackedKeys = useMemo(() => new Set(tracked.keys()), [tracked]);

  // Track an idea: optimistic, persisted server-side; revert on failure.
  const trackIdea = useCallback((kd: KeywordDifficulty) => {
    const k = keyOf(kd);
    setResults((prev) => (prev.some((r) => keyOf(r) === k) ? prev : [...prev, kd]));
    setTracked((prev) => {
      if (prev.has(k)) return prev;
      const next = new Map(prev);
      next.set(k, {
        id: k, keywordId: `${kd.store}:${kd.country.toUpperCase()}:${kd.keyword.toLowerCase()}`,
        keyword: kd.keyword, country: kd.country, store: kd.store,
        note: null, trackedAt: new Date().toISOString(), metrics: kd,
      });
      return next;
    });
    void trackKeyword(kd.keyword, kd.store, kd.country).catch(() => {
      if (mounted.current) setTracked((prev) => { const next = new Map(prev); next.delete(k); return next; });
    });
  }, []);

  // Untrack: optimistic remove from the shortlist; revert on failure.
  const untrackIdea = useCallback((kd: KeywordDifficulty) => {
    const k = keyOf(kd);
    let snapshot: TrackedKeyword | undefined;
    setTracked((prev) => {
      snapshot = prev.get(k);
      const next = new Map(prev);
      next.delete(k);
      return next;
    });
    void untrackKeyword(kd.keyword, kd.store, kd.country).catch(() => {
      if (mounted.current && snapshot) setTracked((prev) => new Map(prev).set(k, snapshot!));
    });
  }, []);

  // Manual add: score + track a typed term without generating its idea set.
  const trackTerm = useCallback(async (term: string, forStore: Store, forCountry: string) => {
    setError(null);
    try {
      const entry = await trackKeyword(term, forStore, forCountry);
      if (!entry || !mounted.current) return;
      setTracked((prev) => new Map(prev).set(keyOf(entry), entry));
      if (entry.metrics) {
        const m = entry.metrics;
        setResults((prev) => (prev.some((r) => keyOf(r) === keyOf(m)) ? prev : [m, ...prev]));
        setSelectedKey(keyOf(m));
      }
      setTab("tracked");
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "Track failed");
    }
  }, []);

  // Refresh: bypass the cache TTL and re-pull live metrics for one keyword.
  const refreshKeyword = useCallback(async (kd: KeywordDifficulty) => {
    setRefreshing(true);
    setError(null);
    try {
      const fresh = await lookupKeyword(kd.keyword, kd.store, kd.country, undefined, { refresh: true });
      if (!mounted.current) return;
      const k = keyOf(fresh);
      setResults((prev) => prev.map((r) => (keyOf(r) === k ? fresh : r)));
      setTracked((prev) => {
        if (!prev.has(k)) return prev;
        const next = new Map(prev);
        next.set(k, { ...next.get(k)!, metrics: fresh });
        return next;
      });
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, []);

  const clearIdeas = useCallback((seedKey: string) => {
    setIdeas((prev) => {
      if (!(seedKey in prev)) return prev;
      const next = { ...prev };
      delete next[seedKey];
      return next;
    });
  }, []);

  const counts = useMemo(
    () => ({
      all: results.length,
      opp: results.filter((r) => r.opportunityScore >= 45).length,
      lowdiff: results.filter((r) => r.difficulty <= 30).length,
      tracked: results.filter((r) => trackedKeys.has(keyOf(r))).length,
      pending: pending.length,
    }),
    [results, pending, trackedKeys],
  );

  const visible = useMemo(() => {
    let list = results;
    if (tab === "opp") list = list.filter((r) => r.opportunityScore >= 45);
    else if (tab === "lowdiff") list = list.filter((r) => r.difficulty <= 30);
    else if (tab === "tracked") list = list.filter((r) => trackedKeys.has(keyOf(r)));
    else if (tab === "pending") list = [];
    const sorted = [...list];
    const sorter = SORTERS[sort];
    if (sorter) sorted.sort(sorter);
    return sorted;
  }, [results, tab, sort, trackedKeys]);

  const showPending = tab === "all" || tab === "pending";

  useEffect(() => {
    if (visible.length === 0) return;
    if (!selectedKey || !visible.some((r) => keyOf(r) === selectedKey)) {
      setSelectedKey(keyOf(visible[0]!));
    }
  }, [visible, selectedKey]);

  const selected = results.find((r) => keyOf(r) === selectedKey) ?? null;
  const selectedIdeas = selected ? ideas[keyOf(selected)] : undefined;
  const hasAnything = results.length > 0 || pending.length > 0;
  const tabs = (hasAnything
    ? [
        ["all", "All"],
        ["opp", "Opportunities"],
        ["lowdiff", "Low diff"],
        ["tracked", "Tracked"],
        ["pending", "Pending"],
      ]
    : [
        ["all", "All"],
        ["opp", "Opportunities"],
        ["lowdiff", "Low diff"],
        ["pending", "Pending"],
      ]) as [Tab, string][];

  return (
    <main className="main">
      {/* header */}
      <div className="topbar">
        <div className="topbar-row">
          <div className="page-title-wrap">
            <div className="page-icon"><IconKey style={{ width: 18, height: 18 }} /></div>
            <div>
              <div className="page-title">Keyword Explorer</div>
              <div className="page-sub">Check keyword difficulty, popularity, and discover related keywords</div>
            </div>
            {results.length > 0 && <span className="count-chip">{results.length}</span>}
          </div>
          <div className="topbar-spacer" />
          <button className="icon-btn" onClick={onToggleTheme} aria-label="Toggle theme" title="Toggle theme">
            {theme === "dark" ? <IconSun /> : <IconMoon />}
          </button>
        </div>

        {/* composer */}
        <div className="aso-composer">
          <div className="aso-composer-row">
            <div className="aso-bigsearch">
              <IconSearch />
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
                }}
                placeholder="Search, paste keywords, or start a topic..."
                rows={1}
                spellCheck={false}
              />
            </div>
            {hasAnything && (
              <>
                <div className="segmented">
                  <button className={store === "apple" ? "on" : ""} onClick={() => setStore("apple")}><IconApple /> App Store</button>
                  <button className={store === "google" ? "on" : ""} onClick={() => setStore("google")}><IconGooglePlay /> Google Play</button>
                </div>
                <div className="select market-select" title="Market">
                  <select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Market">
                    {MARKETS.map((m) => (
                      <option key={m.code} value={m.code}>{m.flag} {m.code}</option>
                    ))}
                  </select>
                  <IconChevron />
                </div>
                {parseTerms(input).length === 1 && (
                  <button
                    className="btn"
                    onClick={() => { const t = parseTerms(input)[0]!; void trackTerm(t, store, country); setInput(""); }}
                    title="Add straight to your tracked shortlist (no idea generation)"
                  >
                    + Track
                  </button>
                )}
                <button className="btn btn-accent" onClick={submit} disabled={!input.trim()}>
                  {parseTerms(input).length > 1 ? <><IconLayers /> Compare</> : <><IconSearch /> Explore</>}
                </button>
              </>
            )}
          </div>
          {hasAnything && (
            <div className="aso-hint">
              <span className="kbd">Enter</span> explore one term for related ideas · paste up to 10 lines to compare · {market(country).flag} {market(country).name} · {MARKET_COUNT} markets
            </div>
          )}
        </div>

        {/* tabs */}
        <div className="aso-tabs">
          <div className="aso-workspace-title">
            <span>Keyword Workspace</span>
            <span className="aso-workspace-count">{results.length}</span>
          </div>
          <div className="select aso-sort-select">
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort keywords">
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <IconChevron />
          </div>
          <button className="aso-row-action" onClick={submit} disabled={!input.trim()}>
            Explore
          </button>
          {tabs.map(([id, label]) => (
            <button key={id} className={`aso-tab ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}>
              {label}
              <span className="aso-tab-count">{counts[id]}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="notice" style={{ margin: "12px 22px 0" }}>
          <IconInfo /> {error}. Check the API server is running.
          <button className="drawer-close" style={{ position: "static", marginLeft: "auto", width: 24, height: 24 }} onClick={() => setError(null)} aria-label="Dismiss"><IconClose /></button>
        </div>
      )}

      {/* body */}
      {!hasAnything ? (
        <div className="aso-empty-workspace">
          <section className="aso-empty-pane">
            <div className="aso-empty-copy">
              <div className="t">No keywords yet</div>
              <div className="s">Add a keyword above to start tracking and discover suggestions</div>
            </div>
          </section>
          <section className="aso-empty-pane aso-empty-pane-detail">
            <div className="aso-empty-copy">
              <div className="t">Select a keyword</div>
              <div className="s">Choose a tracked keyword from the left to discover similar opportunities</div>
            </div>
          </section>
        </div>
      ) : (
        <div className="aso-workspace">
          {(visible.length > 1 || showPending) && (
            <div className="kw-strip">
              {visible.map((kd) => (
                <button
                  key={keyOf(kd)}
                  className={`kw-strip-chip ${keyOf(kd) === selectedKey ? "active" : ""}`}
                  onClick={() => setSelectedKey(keyOf(kd))}
                >
                  {kd.keyword}
                  <span className="kw-strip-opp">{kd.opportunityScore}</span>
                </button>
              ))}
              {showPending && pending.map((kw) => (
                <span key={`p-${kw}`} className="kw-strip-chip pending"><span className="aso-spin" />{kw}</span>
              ))}
            </div>
          )}
          {tab === "pending" ? (
            pending.length > 0 ? (
              <div className="aso-pending-list">
                {pending.map((kw) => <PendingCard key={`p-${kw}`} keyword={kw} />)}
              </div>
            ) : (
              <div className="aso-placeholder">
                <IconKey />
                <div className="t">No lookups in progress</div>
                <div className="s">Pending lookups appear here while they resolve.</div>
              </div>
            )
          ) : selected ? (
            <KeywordDetail
              kd={selected}
              onRefresh={() => void refreshKeyword(selected)}
              refreshing={refreshing}
              tracked={trackedKeys.has(keyOf(selected))}
              onToggleTrack={() =>
                trackedKeys.has(keyOf(selected)) ? untrackIdea(selected) : trackIdea(selected)
              }
            >
              {liveMarkets[keyOf(selected)] && (
                <LiveMarketsCard
                  markets={liveMarkets[keyOf(selected)]!}
                  progress={marketsProgress[keyOf(selected)] ?? "done"}
                />
              )}
              {selectedIdeas && (
                <IdeasTable
                  seed={selected.keyword}
                  store={store}
                  country={country}
                  ideas={selectedIdeas}
                  trackedKeys={trackedKeys}
                  onTrack={trackIdea}
                  onUntrack={untrackIdea}
                  onClear={() => clearIdeas(keyOf(selected))}
                />
              )}
            </KeywordDetail>
          ) : pending.length > 0 ? (
            <PendingCard keyword={pending[0]!} />
          ) : (
            <div className="aso-placeholder">
              <IconKey />
              <div className="t">{results.length > 0 ? "Nothing in this view" : "Select a keyword"}</div>
              <div className="s">
                {results.length > 0
                  ? "No keywords match this filter yet."
                  : "Pick a keyword above to see its insights and the apps that rank for it."}
              </div>
            </div>
          )}
        </div>
      )}

      {gen && <GenerateModal {...gen} />}

      {marketsModal && (
        <MarketsModal
          terms={marketsModal}
          initialStore={store}
          initialCountry={country}
          onConfirm={(s, countries) => startExplore(marketsModal, s, countries)}
          onClose={() => setMarketsModal(null)}
        />
      )}
    </main>
  );
}

/** Cross-market scores for the selected keyword, filling live off the SSE stream. */
function LiveMarketsCard({
  markets,
  progress,
}: {
  markets: KeywordMarket[];
  progress: { done: number; total: number } | "done";
}) {
  return (
    <div className="km-live">
      <div className="km-live-head">
        <span className="km-live-title">Markets</span>
        {progress === "done" ? (
          <span className="km-live-count">{markets.length} analysed</span>
        ) : (
          <span className="km-live-count km-live-running">
            analysing {progress.done}/{progress.total}…
          </span>
        )}
      </div>
      <div className="km-live-grid">
        {markets.map((m) => (
          <div key={m.country} className="km-live-row">
            <span className="km-flag">{market(m.country).flag}</span>
            <span className="km-live-cc">{m.country}</span>
            <span className="km-live-stat" title="Popularity">P {m.popularity}</span>
            <span className="km-live-stat" title="Difficulty">D {m.difficulty}</span>
            <span className="km-live-opp" title="Opportunity">{m.opportunityScore}</span>
          </div>
        ))}
        {progress !== "done" && <div className="km-live-row km-live-pending">…</div>}
      </div>
    </div>
  );
}
