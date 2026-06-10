import { useEffect, useMemo, useState } from "react";
import "../styles/aistudio.css";
import {
  blueprintLabel,
  fetchHotIdeas,
  queryIdeas,
  triggerIdeaGeneration,
  type AppIdea,
  type BlueprintTag,
  type IdeaGenerator,
} from "../lib/api/ideas";
import { generatePrd, type PrdResult } from "../lib/api/assist";
import { StudioHeader } from "../components/aistudio/StudioHeader";
import { StudioEmptyState } from "../components/aistudio/StudioEmptyState";
import { IdeaCard } from "../components/aistudio/IdeaCard";
import { FavoriteToggle } from "../components/FavoriteToggle";
import { IconSearch, IconChevron, IconArrowDown, IconArrowUp } from "../icons";
import { IconBulb } from "../components/aistudio/icons";

const SORTS: { value: "created" | "reviews" | "rating"; label: string }[] = [
  { value: "created", label: "Newest" },
  { value: "reviews", label: "Reviews" },
  { value: "rating", label: "Rating" },
];
const BLUEPRINTS: BlueprintTag[] = ["backend", "database", "ai"];
const PAGE_SIZE = 12;

function relativeDay(epochSec: number | null): string {
  if (!epochSec) return "unknown";
  const d = new Date(epochSec * 1000);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function HotIdeasPage() {
  const [search, setSearch] = useState("");
  const [sourceCategory, setSourceCategory] = useState("");
  const [ideaCategory, setIdeaCategory] = useState("");
  const [blueprint, setBlueprint] = useState<BlueprintTag[]>([]);
  const [sort, setSort] = useState<"created" | "reviews" | "rating">("created");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const [all, setAll] = useState<AppIdea[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [generator, setGenerator] = useState<IdeaGenerator | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // PRD modal state
  const [prdFor, setPrdFor] = useState<AppIdea | null>(null);
  const [prd, setPrd] = useState<PrdResult | null>(null);
  const [prdBusy, setPrdBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetchHotIdeas();
      setAll(r.ideas);
      setAvailable(r.available);
      setGenerator(r.generator);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, sourceCategory, ideaCategory, blueprint, sort, order]);

  const sourceCategories = useMemo(
    () => [...new Set(all.map((i) => i.sourceCategory))].sort(),
    [all],
  );
  const ideaCategories = useMemo(
    () => [...new Set(all.map((i) => i.ideaCategory))].sort(),
    [all],
  );

  const result = useMemo(
    () =>
      queryIdeas(all, {
        search,
        sourceCategory,
        ideaCategory,
        blueprint,
        sort,
        order,
        page,
        pageSize: PAGE_SIZE,
      }),
    [all, search, sourceCategory, ideaCategory, blueprint, sort, order, page],
  );

  function toggleBlueprint(tag: BlueprintTag) {
    setBlueprint((b) => (b.includes(tag) ? b.filter((t) => t !== tag) : [...b, tag]));
  }

  async function refresh() {
    setRefreshing(true);
    setNotice(null);
    try {
      const r = await triggerIdeaGeneration();
      if (r.ran && r.generated > 0) setNotice(`Generated ${r.generated} fresh idea${r.generated === 1 ? "" : "s"}.`);
      else if (r.ran) setNotice("No new ideas this run — every rising app already has a current idea.");
      else setNotice(r.reason ?? "Generator is dormant.");
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  async function openPrd(idea: AppIdea) {
    setPrdFor(idea);
    setPrd(null);
    setPrdBusy(true);
    setCopied(false);
    try {
      setPrd(await generatePrd(idea.id));
    } catch {
      setPrd({ available: false, enriched: false });
    } finally {
      setPrdBusy(false);
    }
  }

  function download(filename: string, text: string) {
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyPrompt() {
    if (!prd?.promptPack) return;
    navigator.clipboard?.writeText(prd.promptPack).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      },
      () => {},
    );
  }

  const total = result.total;
  const pageCount = result.pageCount;
  const ideas = result.ideas;
  const filtered = !!(search || sourceCategory || ideaCategory || blueprint.length);
  const dormant = generator?.dormantReason ?? null;
  const lastGen = generator?.latestIdeaAt ?? null;

  return (
    <main className="main">
      <StudioHeader
        icon={<IconBulb style={{ width: 18, height: 18 }} />}
        title="Hot app ideas"
        subtitle="Concepts mined from today's rising, under-served apps — refreshed as the market moves"
        count={generator?.totalIdeas ?? all.length}
      />

      {/* ---------------- freshness banner ---------------- */}
      <div className="ideas-freshness">
        <div className="ideas-fresh-left">
          {dormant ? (
            <span className="ideas-dormant">
              <span className="ideas-dot warn" /> Generator dormant — {dormant}. Showing the last real batch; set a
              Gemini key in API Keys to refresh daily.
            </span>
          ) : (
            <span className="ideas-live">
              <span className="ideas-dot ok" /> Live feed · {all.length} idea{all.length === 1 ? "" : "s"} · newest{" "}
              {relativeDay(lastGen)}
            </span>
          )}
          {notice && <span className="ideas-notice">{notice}</span>}
        </div>
        <button className="btn" onClick={refresh} disabled={refreshing}>
          {refreshing ? "Generating…" : "Refresh ideas"}
        </button>
      </div>

      {/* ---------------- filter rail ---------------- */}
      <div className="studio-filterbar">
        <div className="search" style={{ flex: "0 1 280px" }}>
          <IconSearch />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ideas…" spellCheck={false} />
        </div>

        <div className="select">
          <select value={sourceCategory} onChange={(e) => setSourceCategory(e.target.value)}>
            <option value="">All app categories</option>
            {sourceCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <IconChevron />
        </div>

        <div className="select">
          <select value={ideaCategory} onChange={(e) => setIdeaCategory(e.target.value)}>
            <option value="">All idea types</option>
            {ideaCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <IconChevron />
        </div>

        <div className="toolbar-divider" />

        <div className="select">
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>Sort: {s.label}</option>
            ))}
          </select>
          <IconChevron />
        </div>
        <button
          className="icon-btn"
          title={order === "desc" ? "Descending" : "Ascending"}
          onClick={() => setOrder((o) => (o === "desc" ? "asc" : "desc"))}
        >
          {order === "desc" ? <IconArrowDown /> : <IconArrowUp />}
        </button>

        <div className="toolbar-divider" />

        <div className="studio-filter-chips">
          {BLUEPRINTS.map((tag) => (
            <button key={tag} className={`studio-chip${blueprint.includes(tag) ? " on" : ""}`} onClick={() => toggleBlueprint(tag)}>
              <span className="dot" />
              {blueprintLabel(tag)}
            </button>
          ))}
        </div>
      </div>

      {/* ---------------- grid ---------------- */}
      <div className="ideas-scroll">
        {loading ? (
          <div className="ideas-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div className="idea-card" key={i}>
                <div className="skel" style={{ height: 18, width: "75%" }} />
                <div className="skel" style={{ height: 44, width: "100%" }} />
                <div className="skel" style={{ height: 12, width: "55%" }} />
              </div>
            ))}
          </div>
        ) : ideas.length === 0 ? (
          <StudioEmptyState
            icon={<IconBulb />}
            title={filtered ? "No ideas match these filters" : available ? "No ideas yet" : "Ideas store unavailable"}
            sub={
              filtered
                ? "Clear a filter or widen the blueprint tags."
                : dormant
                  ? "The generator is dormant without a Gemini key. Add one in API Keys, then hit Refresh ideas."
                  : "Hit Refresh ideas to mine today's rising, under-served apps into fresh concepts."
            }
          />
        ) : (
          <div className="ideas-grid">
            {ideas.map((idea) => (
              <div key={idea.id} style={{ position: "relative", display: "grid" }}>
                <IdeaCard idea={idea} onViewPrd={() => openPrd(idea)} />
                <div style={{ position: "absolute", right: 12, top: 12 }}>
                  <FavoriteToggle
                    type="hotIdea"
                    id={idea.id}
                    snapshot={{
                      title: idea.title,
                      subtitle: `${idea.ideaCategory} · ${idea.sourceCategory}`,
                      href: "/dashboard/hot-ideas",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && total > 0 && (
          <div className="ideas-pager">
            <div className="meta">
              {total.toLocaleString()} idea{total === 1 ? "" : "s"} · Page {result.page} of {pageCount}
            </div>
            <div className="nav">
              <button className="btn" disabled={result.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Prev
              </button>
              <span className="pager-page">{result.page} / {pageCount}</span>
              <button className="btn" disabled={result.page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---------------- PRD modal ---------------- */}
      {prdFor && (
        <div className="prd-overlay" onClick={() => setPrdFor(null)}>
          <div className="prd-modal" onClick={(e) => e.stopPropagation()}>
            <div className="prd-modal-head">
              <div>
                <div className="prd-modal-title">{prdFor.title}</div>
                <div className="prd-modal-sub">
                  PRD from the stored build blueprint
                  {prd?.enriched ? " · Gemini-sharpened" : prd ? " · template" : ""}
                </div>
              </div>
              <button className="icon-btn" onClick={() => setPrdFor(null)} title="Close">✕</button>
            </div>

            <div className="prd-modal-body">
              {prdBusy && <div className="assist-empty-sm">Assembling PRD…</div>}
              {!prdBusy && prd?.markdown && <pre className="prd-pre">{prd.markdown}</pre>}
              {!prdBusy && prd && !prd.markdown && (
                <div className="assist-empty-sm">No blueprint stored for this idea yet.</div>
              )}
            </div>

            {prd?.markdown && (
              <div className="prd-modal-actions">
                <button className="btn" onClick={() => download(`PRD-${prdFor.slug ?? prdFor.id}.md`, prd.markdown!)}>
                  Download .md
                </button>
                <button className="btn btn-accent" onClick={copyPrompt}>
                  {copied ? "Copied ✓" : "Copy Claude Code prompt"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
