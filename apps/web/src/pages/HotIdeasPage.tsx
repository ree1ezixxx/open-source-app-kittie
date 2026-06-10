import { useEffect, useState } from "react";
import "../styles/aistudio.css";
import { aiService } from "../lib/aiService";
import {
  SOURCE_CATEGORIES,
  IDEA_CATEGORIES,
  blueprintLabel,
  type BlueprintTag,
  type IdeasPage,
} from "../lib/api/ideas";
import { StudioHeader } from "../components/aistudio/StudioHeader";
import { StudioEmptyState } from "../components/aistudio/StudioEmptyState";
import { IdeaCard } from "../components/aistudio/IdeaCard";
import { IconSearch, IconChevron, IconArrowDown, IconArrowUp } from "../icons";
import { IconBulb } from "../components/aistudio/icons";

const SORTS: { value: "created" | "reviews" | "rating"; label: string }[] = [
  { value: "created", label: "Created" },
  { value: "reviews", label: "Reviews" },
  { value: "rating", label: "Rating" },
];
const BLUEPRINTS: BlueprintTag[] = ["backend", "database", "ai"];
const PAGE_SIZE = 12;

export function HotIdeasPage() {
  const [search, setSearch] = useState("");
  const [sourceCategory, setSourceCategory] = useState("");
  const [ideaCategory, setIdeaCategory] = useState("");
  const [blueprint, setBlueprint] = useState<BlueprintTag[]>([]);
  const [sort, setSort] = useState<"created" | "reviews" | "rating">("created");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<IdeasPage | null>(null);
  const [loading, setLoading] = useState(true);

  // reset to page 1 whenever a filter (not the page itself) changes
  useEffect(() => {
    setPage(1);
  }, [search, sourceCategory, ideaCategory, blueprint, sort, order]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    aiService
      .listIdeas({ search, sourceCategory, ideaCategory, blueprint, sort, order, page, pageSize: PAGE_SIZE })
      .then((r) => alive && setResult(r))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [search, sourceCategory, ideaCategory, blueprint, sort, order, page]);

  function toggleBlueprint(tag: BlueprintTag) {
    setBlueprint((b) => (b.includes(tag) ? b.filter((t) => t !== tag) : [...b, tag]));
  }

  const total = result?.total ?? 0;
  const pageCount = result?.pageCount ?? 1;
  const ideas = result?.ideas ?? [];
  const filtered = !!(search || sourceCategory || ideaCategory || blueprint.length);

  return (
    <main className="main">
      <StudioHeader
        icon={<IconBulb style={{ width: 18, height: 18 }} />}
        title="Hot app ideas"
        subtitle="AI concepts mined from fast-growing apps"
        count={total}
      />

      {/* ---------------- filter rail ---------------- */}
      <div className="studio-filterbar">
        <div className="search" style={{ flex: "0 1 280px" }}>
          <IconSearch />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ideas…" spellCheck={false} />
        </div>

        <div className="select">
          <select value={sourceCategory} onChange={(e) => setSourceCategory(e.target.value)}>
            <option value="">All app categories</option>
            {SOURCE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <IconChevron />
        </div>

        <div className="select">
          <select value={ideaCategory} onChange={(e) => setIdeaCategory(e.target.value)}>
            <option value="">All idea types</option>
            {IDEA_CATEGORIES.map((c) => (
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
              <IdeaCard key={idea.id} idea={idea} />
            ))}
          </div>
        )}

        {!loading && total > 0 && (
          <div className="ideas-pager">
            <div className="meta">
              {total.toLocaleString()} idea{total === 1 ? "" : "s"} · Page {result?.page ?? 1} of {pageCount}
            </div>
            <div className="nav">
              <button className="btn" disabled={(result?.page ?? 1) <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Prev
              </button>
              <span className="pager-page">{result?.page ?? 1} / {pageCount}</span>
              <button className="btn" disabled={(result?.page ?? 1) >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
