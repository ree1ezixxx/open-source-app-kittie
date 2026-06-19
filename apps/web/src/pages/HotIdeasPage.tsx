import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import "../styles/aistudio.css";
import { aiService } from "../lib/aiService";
import {
  blueprintLabel,
  fetchIdeaFacets,
  type BlueprintTag,
  type IdeaSort,
  type IdeasPage,
} from "../lib/api/ideas";
import { StudioHeader } from "../components/aistudio/StudioHeader";
import { StudioEmptyState } from "../components/aistudio/StudioEmptyState";
import { IdeaCard } from "../components/aistudio/IdeaCard";
import { FavoriteToggle } from "../components/FavoriteToggle";
import { IconSearch, IconChevron, IconArrowDown, IconArrowUp, IconClose } from "../icons";
import { IconBulb } from "../components/aistudio/icons";

/** Live-parity sort metrics — all absolute, never growth (ADR 0005). */
const SORTS: { value: IdeaSort; label: string }[] = [
  { value: "created", label: "Created" },
  { value: "released", label: "Released" },
  { value: "reviews", label: "Reviews" },
  { value: "downloads", label: "Downloads" },
  { value: "revenue", label: "Revenue" },
  { value: "rating", label: "Rating" },
  { value: "price", label: "Price" },
];
const BLUEPRINTS: BlueprintTag[] = ["backend", "database", "ai"];
const PAGE_SIZE = 9; // truth: 9 ideas/page

export function HotIdeasPage() {
  const [sp, setSp] = useSearchParams();

  // All filter/sort/page state lives in the URL — deep-linkable + back-aware (truth parity).
  const q = sp.get("q") ?? "";
  const sourceCategory = sp.get("cat") ?? "";
  const ideaCategory = sp.get("type") ?? "";
  const blueprint = useMemo(
    () => ((sp.get("bp")?.split(",").filter(Boolean) ?? []) as BlueprintTag[]),
    [sp],
  );
  const sort = (sp.get("sort") ?? "created") as IdeaSort;
  const order: "asc" | "desc" = sp.get("order") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(sp.get("page") || "1"));

  // Single URL writer; any filter change resets pagination unless keepPage.
  const update = useCallback(
    (patch: Record<string, string | string[] | null>, keepPage = false) => {
      const next = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) next.delete(k);
        else next.set(k, Array.isArray(v) ? v.join(",") : String(v));
      }
      if (!keepPage && !("page" in patch)) next.delete("page");
      setSp(next, { replace: true });
    },
    [setSp],
  );

  // Search box: local state for responsiveness, debounced into the URL (truth debounces too).
  const [searchInput, setSearchInput] = useState(q);
  useEffect(() => { setSearchInput(q); }, [q]); // reflect external resets (Clear all) in the box
  useEffect(() => {
    const t = setTimeout(() => {
      const cur = new URLSearchParams(window.location.search).get("q") ?? "";
      if (searchInput !== cur) update({ q: searchInput || null });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, update]);

  const [result, setResult] = useState<IdeasPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [facets, setFacets] = useState<{ sourceCategories: string[]; ideaCategories: string[] }>({
    sourceCategories: [],
    ideaCategories: [],
  });

  useEffect(() => {
    let alive = true;
    fetchIdeaFacets()
      .then((f) => alive && setFacets(f))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const bpKey = blueprint.join(",");
  useEffect(() => {
    let alive = true;
    setLoading(true);
    aiService
      .listIdeas({ search: q, sourceCategory, ideaCategory, blueprint, sort, order, page, pageSize: PAGE_SIZE })
      .then((r) => alive && setResult(r))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sourceCategory, ideaCategory, bpKey, sort, order, page]);

  function toggleBlueprint(tag: BlueprintTag) {
    update({ bp: blueprint.includes(tag) ? blueprint.filter((t) => t !== tag) : [...blueprint, tag] });
  }

  const total = result?.total ?? 0;
  const pageCount = result?.pageCount ?? 1;
  const ideas = result?.ideas ?? [];
  const activeCount =
    (q ? 1 : 0) + (sourceCategory ? 1 : 0) + (ideaCategory ? 1 : 0) + blueprint.length;
  const filtered = activeCount > 0;

  return (
    <main className="main">
      <StudioHeader
        icon={<IconBulb style={{ width: 18, height: 18 }} />}
        title="Hot app ideas"
        subtitle="AI mockups and concepts from fast-growing apps"
        count={total}
      />

      {/* ---------------- filter rail ---------------- */}
      <div className="studio-filterbar">
        <div className="search" style={{ flex: "0 1 280px" }}>
          <IconSearch />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search ideas…"
            spellCheck={false}
          />
        </div>

        <div className="select">
          <select value={sourceCategory} onChange={(e) => update({ cat: e.target.value || null })}>
            <option value="">All app categories</option>
            {facets.sourceCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <IconChevron />
        </div>

        <div className="select">
          <select value={ideaCategory} onChange={(e) => update({ type: e.target.value || null })}>
            <option value="">All idea types</option>
            {facets.ideaCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <IconChevron />
        </div>

        <div className="toolbar-divider" />

        <div className="select">
          <select value={sort} onChange={(e) => update({ sort: e.target.value })}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>Sort: {s.label}</option>
            ))}
          </select>
          <IconChevron />
        </div>
        <button
          className="icon-btn"
          title={order === "desc" ? "High → low" : "Low → high"}
          onClick={() => update({ order: order === "desc" ? "asc" : "desc" })}
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

        {filtered && (
          <button className="studio-clear" onClick={() => setSp(new URLSearchParams(), { replace: true })}>
            <IconClose style={{ width: 12, height: 12 }} />
            Clear all
            <span className="studio-clear-badge">{activeCount}</span>
          </button>
        )}
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
            title={filtered ? "No ideas match these filters" : "No ideas yet"}
            sub={
              filtered
                ? "Clear a filter or widen the blueprint tags."
                : "Once the ideas pipeline runs against fast-growing apps, concepts will appear here."
            }
          />
        ) : (
          <div className="ideas-grid">
            {ideas.map((idea) => (
              // display:grid wrapper keeps the card stretching like a direct grid item.
              <div key={idea.id} style={{ position: "relative", display: "grid" }}>
                <IdeaCard idea={idea} />
                <div
                  style={{ position: "absolute", right: 12, bottom: 12 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <FavoriteToggle
                    type="hotIdea"
                    id={idea.id}
                    snapshot={{
                      title: idea.title,
                      subtitle: `${idea.ideaCategory} · ${idea.sourceCategory}`,
                      href: idea.storeAppId
                        ? `/dashboard/hot-ideas/app-${idea.slug}-id${idea.storeAppId}`
                        : "/dashboard/hot-ideas",
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
              {total.toLocaleString()} idea{total === 1 ? "" : "s"} · Page {result?.page ?? 1} of {pageCount}
            </div>
            <div className="nav">
              <button className="btn" disabled={(result?.page ?? 1) <= 1} onClick={() => update({ page: String(Math.max(1, page - 1)) }, true)}>
                Prev
              </button>
              <span className="pager-page">{result?.page ?? 1} / {pageCount}</span>
              <button className="btn" disabled={(result?.page ?? 1) >= pageCount} onClick={() => update({ page: String(Math.min(pageCount, page + 1)) }, true)}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
