import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Store } from "@kittie/types";
import { IconApple, IconChevron, IconClose, IconGooglePlay, IconInfo, IconMoon, IconSearch, IconSun } from "../../icons";
import { IconKey, IconLayers } from "../../components/aso/icons";
import { KeywordCard, KeywordDetail, PendingCard } from "../../components/aso/KeywordBits";
import { compareKeywords, fetchSuggestions, lookupKeyword, type KeywordDifficulty } from "../../lib/api/keywords";
import type { Theme } from "../../lib/theme";
import "../../styles/aso.css";

type Tab = "all" | "opp" | "lowdiff" | "pending";
type Sort = "newest" | "opportunity" | "difficulty";

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
  const [input, setInput] = useState("");
  const [results, setResults] = useState<KeywordDifficulty[]>([]);
  const [pending, setPending] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [chips, setChips] = useState<string[]>([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const runLookup = useCallback(
    async (terms: string[], forStore: Store) => {
      if (terms.length === 0) return;
      setError(null);
      setPending((p) => [...new Set([...terms, ...p])]);
      try {
        const fetched =
          terms.length === 1
            ? [await lookupKeyword(terms[0]!, forStore)]
            : await compareKeywords(terms.map((keyword) => ({ keyword, store: forStore })));
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

  function submit() {
    const terms = parseTerms(input);
    if (terms.length === 0) return;
    void runLookup(terms, store);
    setInput("");
  }

  // Deep link: /dashboard/aso/keywords?q=term → immediate lookup (from app detail "suggested keywords").
  const didDeepLink = useRef(false);
  useEffect(() => {
    if (didDeepLink.current) return;
    const q = sp.get("q");
    if (q) {
      didDeepLink.current = true;
      const next = new URLSearchParams(sp);
      next.delete("q");
      setSp(next, { replace: true });
      void runLookup(parseTerms(q), store);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Suggestion chips — re-seed per store.
  useEffect(() => {
    let alive = true;
    fetchSuggestions(store, 12)
      .then((c) => { if (alive) setChips(c); })
      .catch(() => {});
    return () => { alive = false; };
  }, [store]);

  const counts = useMemo(
    () => ({
      all: results.length,
      opp: results.filter((r) => r.opportunityScore >= 45).length,
      lowdiff: results.filter((r) => r.difficulty <= 30).length,
      pending: pending.length,
    }),
    [results, pending],
  );

  const visible = useMemo(() => {
    let list = results;
    if (tab === "opp") list = list.filter((r) => r.opportunityScore >= 45);
    else if (tab === "lowdiff") list = list.filter((r) => r.difficulty <= 30);
    else if (tab === "pending") list = [];
    const sorted = [...list];
    if (sort === "opportunity") sorted.sort((a, b) => b.opportunityScore - a.opportunityScore);
    else if (sort === "difficulty") sorted.sort((a, b) => a.difficulty - b.difficulty);
    // "newest" keeps insertion order (results are prepended newest-first)
    return sorted;
  }, [results, tab, sort]);

  const showPending = tab === "all" || tab === "pending";

  // Keep a valid selection.
  useEffect(() => {
    if (visible.length === 0) return;
    if (!selectedKey || !visible.some((r) => keyOf(r) === selectedKey)) {
      setSelectedKey(keyOf(visible[0]!));
    }
  }, [visible, selectedKey]);

  const selected = results.find((r) => keyOf(r) === selectedKey) ?? null;
  const hasAnything = results.length > 0 || pending.length > 0;

  function onChipTap(kw: string) {
    void runLookup([kw], store);
  }

  return (
    <main className="main">
      {/* header */}
      <div className="topbar">
        <div className="topbar-row">
          <div className="page-title-wrap">
            <div className="page-icon"><IconKey style={{ width: 18, height: 18 }} /></div>
            <div>
              <div className="page-title">Keyword Workspace</div>
              <div className="page-sub">Look up difficulty, compare terms, find openings</div>
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
                placeholder="Search, paste keywords, or start a topic…"
                rows={1}
                spellCheck={false}
              />
            </div>
            <div className="segmented">
              <button className={store === "apple" ? "on" : ""} onClick={() => setStore("apple")}><IconApple /> App Store</button>
              <button className={store === "google" ? "on" : ""} onClick={() => setStore("google")}><IconGooglePlay /> Google Play</button>
            </div>
            <button className="btn btn-accent" onClick={submit} disabled={!input.trim()}>
              {parseTerms(input).length > 1 ? <><IconLayers /> Compare</> : <><IconSearch /> Look up</>}
            </button>
          </div>
          <div className="aso-hint">
            <span className="kbd">⏎</span> look up · paste up to 10 lines to compare · ranked by opportunity · US only (v1)
          </div>
        </div>

        {/* tabs */}
        <div className="aso-tabs">
          {([
            ["all", "All"],
            ["opp", "Opportunities"],
            ["lowdiff", "Low-diff"],
            ["pending", "Pending"],
          ] as [Tab, string][]).map(([id, label]) => (
            <button key={id} className={`aso-tab ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}>
              {label}
              <span className="aso-tab-count">{counts[id]}</span>
            </button>
          ))}
          <div className="select" style={{ marginLeft: "auto", alignSelf: "center" }}>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="newest">Sort: Newest</option>
              <option value="opportunity">Sort: Opportunity</option>
              <option value="difficulty">Sort: Difficulty</option>
            </select>
            <IconChevron />
          </div>
        </div>
      </div>

      {error && (
        <div className="notice" style={{ margin: "12px 22px 0" }}>
          <IconInfo /> {error}. The API should be running on port 3007.
          <button className="drawer-close" style={{ position: "static", marginLeft: "auto", width: 24, height: 24 }} onClick={() => setError(null)} aria-label="Dismiss"><IconClose /></button>
        </div>
      )}

      {/* body */}
      {!hasAnything ? (
        <div className="aso-hero">
          <div className="aso-hero-mark"><IconKey /></div>
          <h2>Start with a keyword</h2>
          <p>Type a term and hit enter for a single lookup, or paste up to 10 terms to compare them side by side — ranked by opportunity.</p>
          {chips.length > 0 && (
            <>
              <div className="aso-hero-seedlabel">Try one from your catalog</div>
              <div className="chip-rail">
                {chips.map((c) => (
                  <button key={c} className="chip" onClick={() => onChipTap(c)}><IconSearch />{c}</button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="aso-split">
          <div className="aso-list">
            {showPending && pending.map((kw) => <PendingCard key={`p-${kw}`} keyword={kw} />)}
            {visible.map((kd) => (
              <KeywordCard
                key={keyOf(kd)}
                kd={kd}
                active={keyOf(kd) === selectedKey}
                onSelect={() => setSelectedKey(keyOf(kd))}
              />
            ))}
            {visible.length === 0 && !showPending && (
              <div className="aso-empty" style={{ marginTop: 12 }}>
                <IconKey />
                <div className="t">Nothing in this view</div>
                <div className="s">No looked-up keywords match this filter yet.</div>
              </div>
            )}
            {tab === "pending" && pending.length === 0 && (
              <div className="aso-empty" style={{ marginTop: 12 }}>
                <IconKey />
                <div className="t">No lookups in progress</div>
                <div className="s">Pending lookups appear here while they resolve.</div>
              </div>
            )}
          </div>
          <div className="aso-detail">
            {selected ? (
              <KeywordDetail kd={selected} />
            ) : (
              <div className="aso-placeholder">
                <IconKey />
                <div className="t">Select a keyword</div>
                <div className="s">Pick a result on the left to see its insights and the apps that rank for it.</div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
