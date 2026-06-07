/* ============================================================
   Lane D — Reviews tab panels.
   Overview · Reviews (REAL text) · Semantics (mock) · Improvements (mock)
   ============================================================ */
import { useMemo, useState } from "react";
import type { Review } from "@kittie/types";
import {
  averageRating,
  ratingDistribution,
  type ReviewInsights,
} from "../../lib/api/reviews";
import { EmptyState, MockBadge, MockNotice } from "../../components/reviews/primitives";
import { formatCompact, relativeTime } from "../../lib/format";
import { IconStar, IconSearch, IconSpark, IconChart } from "../../icons";

/* ---- tiny star row ---- */
function Stars({ value, size = 12 }: { value: number; size?: number }) {
  return (
    <span className="rv-stars" aria-label={`${value} stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <IconStar
          key={n}
          style={{ width: size, height: size, color: n <= value ? "#f5c451" : "var(--text-faint)" }}
        />
      ))}
    </span>
  );
}

const SENTIMENT_COLOR = {
  positive: "var(--positive)",
  neutral: "var(--text-tertiary)",
  negative: "var(--negative)",
} as const;

/* ============================================================ Overview */
export function OverviewTab({ reviews, insights }: { reviews: Review[]; insights: ReviewInsights }) {
  const dist = ratingDistribution(reviews);
  const avg = averageRating(reviews);
  const total = reviews.length;
  const maxBar = Math.max(1, ...([5, 4, 3, 2, 1] as const).map((k) => dist[k]));
  const { sentiment } = insights;

  return (
    <div className="rv-grid-2">
      {/* rating distribution — REAL */}
      <section className="rv-card">
        <div className="rv-card-head">
          <div className="rv-card-title">Rating distribution</div>
          <span className="rv-card-meta">{formatCompact(total)} loaded</span>
        </div>
        <div className="rv-avg">
          <div className="rv-avg-num">{avg != null ? avg.toFixed(2) : "—"}</div>
          <div>
            <Stars value={Math.round(avg ?? 0)} size={15} />
            <div className="rv-avg-sub">across the latest {formatCompact(total)} reviews</div>
          </div>
        </div>
        <div className="rv-dist">
          {([5, 4, 3, 2, 1] as const).map((k) => (
            <div className="rv-dist-row" key={k}>
              <span className="rv-dist-k">{k}<IconStar style={{ width: 11, height: 11, color: "#f5c451" }} /></span>
              <span className="rv-dist-track">
                <span
                  className="rv-dist-fill"
                  style={{ width: `${(dist[k] / maxBar) * 100}%`, background: k >= 4 ? "var(--positive)" : k === 3 ? "#f5b545" : "var(--negative)" }}
                />
              </span>
              <span className="rv-dist-n">{formatCompact(dist[k])}</span>
            </div>
          ))}
        </div>
      </section>

      {/* sentiment — MOCK */}
      <section className="rv-card">
        <div className="rv-card-head">
          <div className="rv-card-title">Sentiment summary</div>
          <MockBadge />
        </div>
        <div className="rv-net">
          <div className="rv-net-num" style={{ color: sentiment.netScore >= 0 ? "var(--positive)" : "var(--negative)" }}>
            {sentiment.netScore > 0 ? "+" : ""}{sentiment.netScore}
          </div>
          <div className="rv-net-label">Net sentiment score</div>
        </div>
        <div className="rv-sent-bar">
          <span style={{ width: `${sentiment.positive * 100}%`, background: "var(--positive)" }} />
          <span style={{ width: `${sentiment.neutral * 100}%`, background: "var(--text-faint)" }} />
          <span style={{ width: `${sentiment.negative * 100}%`, background: "var(--negative)" }} />
        </div>
        <div className="rv-sent-legend">
          <span><i style={{ background: "var(--positive)" }} />Positive {Math.round(sentiment.positive * 100)}%</span>
          <span><i style={{ background: "var(--text-faint)" }} />Neutral {Math.round(sentiment.neutral * 100)}%</span>
          <span><i style={{ background: "var(--negative)" }} />Negative {Math.round(sentiment.negative * 100)}%</span>
        </div>
        <MockNotice>
          Sentiment classification isn’t computed on the backend yet — these figures are a sample
          shape derived from the real rating mix, shown to preview the surface.
        </MockNotice>
      </section>
    </div>
  );
}

/* ============================================================ Reviews (REAL) */
type RatingFilter = "all" | "5" | "4" | "3" | "2" | "1";
type ReviewSort = "newest" | "oldest" | "highest" | "lowest";

export function ReviewsTab({ reviews }: { reviews: Review[] }) {
  const [rating, setRating] = useState<RatingFilter>("all");
  const [sort, setSort] = useState<ReviewSort>("newest");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    let list = reviews;
    if (rating !== "all") list = list.filter((r) => Math.round(r.rating) === Number(rating));
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter(
        (r) => (r.title ?? "").toLowerCase().includes(needle) || r.body.toLowerCase().includes(needle),
      );
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case "oldest": return +new Date(a.reviewedAt) - +new Date(b.reviewedAt);
        case "highest": return b.rating - a.rating;
        case "lowest": return a.rating - b.rating;
        default: return +new Date(b.reviewedAt) - +new Date(a.reviewedAt);
      }
    });
    return sorted;
  }, [reviews, rating, sort, q]);

  return (
    <div className="rv-reviews">
      <div className="rv-filters">
        <div className="rv-rating-seg">
          {(["all", "5", "4", "3", "2", "1"] as RatingFilter[]).map((r) => (
            <button key={r} className={`rv-seg-btn ${rating === r ? "on" : ""}`} onClick={() => setRating(r)}>
              {r === "all" ? "All" : <>{r}<IconStar style={{ width: 11, height: 11, color: rating === r ? "#f5c451" : "currentColor" }} /></>}
            </button>
          ))}
        </div>
        <div className="select">
          <select value={sort} onChange={(e) => setSort(e.target.value as ReviewSort)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="highest">Highest rated</option>
            <option value="lowest">Lowest rated</option>
          </select>
        </div>
        <div className="search rv-search">
          <IconSearch />
          <input placeholder="Search review text…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="rv-filter-count">{formatCompact(filtered.length)} shown</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<IconSearch />}
          title="No reviews match these filters"
          sub="Try clearing the search or selecting a different rating."
        />
      ) : (
        <ul className="rv-review-list">
          {filtered.map((r) => (
            <li className="rv-review" key={r.id}>
              <div className="rv-review-top">
                <Stars value={Math.round(r.rating)} />
                {r.title && <span className="rv-review-title">{r.title}</span>}
                <span className="rv-review-date">{relativeTime(r.reviewedAt)}</span>
              </div>
              <p className="rv-review-body">{r.body}</p>
              <div className="rv-review-foot">
                <span className="rv-review-author">{r.author ?? "Anonymous"}</span>
                <span className="rv-dot">·</span>
                <span>{r.country}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ============================================================ Semantics (MOCK) */
export function SemanticsTab({ insights }: { insights: ReviewInsights }) {
  const clusters = [...insights.clusters].sort((a, b) => b.share - a.share);
  return (
    <div className="rv-semantics">
      <MockNotice>
        Theme clustering isn’t built on the backend yet. These clusters are a representative sample
        of what semantic grouping over the {clusters.length} largest themes will surface.
      </MockNotice>
      <div className="rv-cluster-grid">
        {clusters.map((c) => (
          <div className="rv-cluster" key={c.id}>
            <div className="rv-cluster-head">
              <span className="rv-cluster-dot" style={{ background: SENTIMENT_COLOR[c.sentiment] }} />
              <span className="rv-cluster-label">{c.label}</span>
              <span className="rv-cluster-share">{Math.round(c.share * 100)}%</span>
            </div>
            <div className="rv-cluster-track">
              <span style={{ width: `${c.share * 100}%`, background: SENTIMENT_COLOR[c.sentiment] }} />
            </div>
            <div className="rv-cluster-meta">{formatCompact(c.mentions)} mentions · {c.sentiment}</div>
            <p className="rv-cluster-quote">“{c.sampleQuote}”</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================ Improvements (MOCK) */
const IMPACT_COLOR = { high: "var(--positive)", medium: "#f5b545", low: "var(--text-tertiary)" } as const;

export function ImprovementsTab({ insights }: { insights: ReviewInsights }) {
  return (
    <div className="rv-improvements">
      <MockNotice>
        AI-generated improvement suggestions aren’t built on the backend yet. The cards below preview
        the shape — each would cite the real reviews backing it.
      </MockNotice>
      <div className="rv-suggest-list">
        {insights.improvements.map((s) => (
          <div className="rv-suggest" key={s.id}>
            <div className="rv-suggest-icon"><IconSpark /></div>
            <div className="rv-suggest-body">
              <div className="rv-suggest-title">{s.title}</div>
              <p className="rv-suggest-detail">{s.detail}</p>
              <div className="rv-suggest-tags">
                <span className="rv-tag" style={{ color: IMPACT_COLOR[s.impact] }}>
                  <i style={{ background: IMPACT_COLOR[s.impact] }} />{s.impact} impact
                </span>
                <span className="rv-tag rv-tag-muted">{s.effort} effort</span>
                <span className="rv-tag rv-tag-muted"><IconChart style={{ width: 11, height: 11 }} />{formatCompact(s.evidence)} reviews</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
