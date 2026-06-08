/* ============================================================
   Lane D — Reviews tab panels.
   Overview · Reviews (feed) · Semantics · Improvements.

   All four are now driven by REAL review data + the review-intel layer
   (`reviewIntel.ts`). Topic / sentiment / improvement tags come from the
   interim heuristic classifier — the one LLM-swap seam — so every surface
   is live today and sharpens when the model is plugged in.
   ============================================================ */
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  averageRating,
  ratingDistribution,
} from "../../lib/api/reviews";
import {
  topicTimeSeries,
  improvementTimeSeries,
  improvementAreas,
  sentimentCounts,
  topicFacets,
  improvementFacets,
  withinPeriod,
  SENTIMENT_LABEL,
  SERIES_PALETTE,
  GRANULARITY_LABEL,
  type TaggedReview,
  type Sentiment4,
  type DimensionTimeSeries,
} from "../../lib/api/reviewIntel";
import { TrendChart, type TrendSeries } from "../../components/reviews/TrendChart";
import { EmptyState, MockNotice } from "../../components/reviews/primitives";
import { formatCompact, relativeTime } from "../../lib/format";
import { IconStar, IconSearch, IconSpark, IconChart, IconUsers, IconRefresh } from "../../icons";

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

/* tiny inline trend line — replaces the awkward topic-timeline matrix */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const n = values.length;
  if (n < 2) return <span className="rv-spark-empty">—</span>;
  const max = Math.max(1, ...values);
  const W = 84, H = 22, p = 2;
  const x = (i: number) => p + (i / (n - 1)) * (W - 2 * p);
  const y = (v: number) => p + (1 - v / max) * (H - 2 * p);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <svg className="rv-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const SENTIMENT_COLOR = {
  positive: "var(--positive)",
  neutral: "var(--text-tertiary)",
  negative: "var(--negative)",
  mixed: "#c8a8e9",
} as const;

const PERIODS: { label: string; days: number | null }[] = [
  { label: "All", days: null },
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "180d", days: 180 },
];

const INTERIM_NOTE =
  "Topics are tagged by an interim keyword classifier, so the surface is live — counts, sentiment and ratings are real aggregates over the loaded reviews. Categorisation accuracy sharpens once the AI model is enabled.";

/** Convert a dimension time-series into multi-series trend-chart input. */
function toTrend(ts: DimensionTimeSeries): { periods: string[]; series: TrendSeries[] } {
  return {
    periods: ts.periods.map((p) => p.label),
    series: ts.rows.map((r, i) => ({
      key: r.label,
      label: r.label,
      color: SERIES_PALETTE[i % SERIES_PALETTE.length] ?? "#888",
      values: ts.periods.map((p) => r.periodValues[p.key] ?? 0),
    })),
  };
}

/* ============================================================ Overview */
export function OverviewTab({ tagged, appsMonitored }: { tagged: TaggedReview[]; appsMonitored: number }) {
  const reviews = tagged.map((t) => t.review);
  const dist = ratingDistribution(reviews);
  const avg = averageRating(reviews);
  const total = reviews.length;
  const maxBar = Math.max(1, ...([5, 4, 3, 2, 1] as const).map((k) => dist[k]));

  const sent = sentimentCounts(tagged);
  const sTotal = total || 1;
  const pos = sent.positive / sTotal;
  const neg = sent.negative / sTotal;
  const neu = Math.max(0, 1 - pos - neg);
  const net = Math.round((pos - neg) * 100);

  return (
    <div className="rv-overview">
      {/* KPI cards */}
      <div className="rv-kpis">
        <div className="rv-kpi">
          <div className="rv-kpi-ic"><IconUsers style={{ width: 17, height: 17 }} /></div>
          <div>
            <div className="rv-kpi-num">{formatCompact(total)}</div>
            <div className="rv-kpi-label">Total Reviews</div>
          </div>
        </div>
        <div className="rv-kpi">
          <div className="rv-kpi-ic"><IconStar style={{ width: 17, height: 17 }} /></div>
          <div>
            <div className="rv-kpi-num">{avg != null ? avg.toFixed(2) : "—"}</div>
            <div className="rv-kpi-label">Average Rating</div>
          </div>
        </div>
        <div className="rv-kpi">
          <div className="rv-kpi-ic"><IconChart style={{ width: 17, height: 17 }} /></div>
          <div>
            <div className="rv-kpi-num">{appsMonitored}</div>
            <div className="rv-kpi-label">Apps Monitored</div>
          </div>
        </div>
      </div>

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

        {/* sentiment — REAL (interim tags) */}
        <section className="rv-card">
          <div className="rv-card-head">
            <div className="rv-card-title">Sentiment summary</div>
            <span className="rv-card-meta">tagged</span>
          </div>
          <div className="rv-net">
            <div className="rv-net-num" style={{ color: net >= 0 ? "var(--positive)" : "var(--negative)" }}>
              {net > 0 ? "+" : ""}{net}
            </div>
            <div className="rv-net-label">Net sentiment score</div>
          </div>
          <div className="rv-sent-bar">
            <span style={{ width: `${pos * 100}%`, background: "var(--positive)" }} />
            <span style={{ width: `${neu * 100}%`, background: "var(--text-faint)" }} />
            <span style={{ width: `${neg * 100}%`, background: "var(--negative)" }} />
          </div>
          <div className="rv-sent-legend">
            <span><i style={{ background: "var(--positive)" }} />Positive {Math.round(pos * 100)}%</span>
            <span><i style={{ background: "var(--text-faint)" }} />Neutral {Math.round(neu * 100)}%</span>
            <span><i style={{ background: "var(--negative)" }} />Negative {Math.round(neg * 100)}%</span>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ============================================================ Reviews (feed) */
type RatingFilter = "all" | "5" | "4" | "3" | "2" | "1";
type SentFilter = "all" | Sentiment4;
type ReviewSort = "newest" | "oldest" | "highest" | "lowest";

export function ReviewsTab({ tagged }: { tagged: TaggedReview[] }) {
  const [sp, setSp] = useSearchParams();
  const [rating, setRating] = useState<RatingFilter>("all");
  const [sentiment, setSentiment] = useState<SentFilter>("all");
  const [days, setDays] = useState<number | null>(null);
  const [sort, setSort] = useState<ReviewSort>("newest");
  const [q, setQ] = useState("");

  // deep-link filters (?topic= / ?area=) — Improvements/Semantics drill into here
  const topic = sp.get("topic");
  const area = sp.get("area");
  const setParam = (key: "topic" | "area", val: string | null) => {
    const next = new URLSearchParams(sp);
    if (val) next.set(key, val); else next.delete(key);
    setSp(next, { replace: true });
  };

  const periodSet = useMemo(() => withinPeriod(tagged, days), [tagged, days]);
  const sFacet = useMemo(() => sentimentCounts(periodSet), [periodSet]);
  const tFacets = useMemo(() => topicFacets(periodSet), [periodSet]);
  const iFacets = useMemo(() => improvementFacets(periodSet), [periodSet]);

  const filtered = useMemo(() => {
    let list = periodSet;
    if (rating !== "all") list = list.filter((t) => Math.round(t.review.rating) === Number(rating));
    if (sentiment !== "all") list = list.filter((t) => t.tags.sentiment === sentiment);
    if (topic) list = list.filter((t) => t.tags.topics.includes(topic));
    if (area) list = list.filter((t) => t.tags.improvementAreas.includes(area));
    if (q.trim()) {
      const n = q.trim().toLowerCase();
      list = list.filter((t) => (t.review.title ?? "").toLowerCase().includes(n) || t.review.body.toLowerCase().includes(n));
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case "oldest": return +new Date(a.review.reviewedAt) - +new Date(b.review.reviewedAt);
        case "highest": return b.review.rating - a.review.rating;
        case "lowest": return a.review.rating - b.review.rating;
        default: return +new Date(b.review.reviewedAt) - +new Date(a.review.reviewedAt);
      }
    });
    return sorted;
  }, [periodSet, rating, sentiment, topic, area, q, sort]);

  // "Mixed" intentionally omitted — too discretionary a bucket to filter on.
  const SENTS: SentFilter[] = ["all", "positive", "negative", "neutral"];

  return (
    <div className="rv-reviews">
      {/* period */}
      <div className="rv-period">
        <span className="rv-period-label">Period</span>
        {PERIODS.map((p) => (
          <button key={p.label} className={`rv-chip ${days === p.days ? "on" : ""}`} onClick={() => setDays(p.days)}>{p.label}</button>
        ))}
      </div>

      {/* rating + sentiment + sort + search */}
      <div className="rv-filters">
        <div className="rv-rating-seg">
          {(["all", "5", "4", "3", "2", "1"] as RatingFilter[]).map((r) => (
            <button key={r} className={`rv-seg-btn ${rating === r ? "on" : ""}`} onClick={() => setRating(r)}>
              {r === "all" ? "All" : <>{r}<IconStar style={{ width: 11, height: 11, color: rating === r ? "#f5c451" : "currentColor" }} /></>}
            </button>
          ))}
        </div>
        <div className="rv-rating-seg">
          {SENTS.map((s) => (
            <button key={s} className={`rv-seg-btn ${sentiment === s ? "on" : ""}`} onClick={() => setSentiment(s)}>
              {s === "all" ? "All" : SENTIMENT_LABEL[s as Sentiment4]}
              {s !== "all" && <span className="rv-seg-n">{sFacet[s as Sentiment4]}</span>}
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

      {/* topic facets — single scrollable lane, not a wrapping wall of chips */}
      {tFacets.length > 0 && (
        <div className="rv-facets rv-facets-scroll">
          <span className="rv-facet-label">Topics</span>
          <button className={`rv-chip ${!topic ? "on" : ""}`} onClick={() => setParam("topic", null)}>All</button>
          {tFacets.map((f) => (
            <button key={f.label} className={`rv-chip ${topic === f.label ? "on" : ""}`} onClick={() => setParam("topic", topic === f.label ? null : f.label)}>
              {f.label}<span className="rv-chip-n">{f.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* improvement facets — same scrollable lane */}
      {iFacets.length > 0 && (
        <div className="rv-facets rv-facets-scroll">
          <span className="rv-facet-label">Improvements</span>
          <button className={`rv-chip ${!area ? "on" : ""}`} onClick={() => setParam("area", null)}>All</button>
          {iFacets.map((f) => (
            <button key={f.label} className={`rv-chip ${area === f.label ? "on" : ""}`} onClick={() => setParam("area", area === f.label ? null : f.label)}>
              {f.label}<span className="rv-chip-n">{f.count}</span>
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<IconSearch />}
          title="No reviews match these filters"
          sub="Try clearing a filter or widening the period."
        />
      ) : (
        <ul className="rv-review-list">
          {filtered.map((t) => {
            const r = t.review;
            return (
              <li className="rv-review" key={r.id}>
                <div className="rv-review-top">
                  <Stars value={Math.round(r.rating)} />
                  {r.title && <span className="rv-review-title">{r.title}</span>}
                  <span className="rv-review-date">{relativeTime(r.reviewedAt)}</span>
                </div>
                <p className="rv-review-body">{r.body}</p>
                <div className="rv-review-foot">
                  <span className="rv-rev-sent" style={{ color: SENTIMENT_COLOR[t.tags.sentiment] }}>
                    <i style={{ background: SENTIMENT_COLOR[t.tags.sentiment] }} />{SENTIMENT_LABEL[t.tags.sentiment]}
                  </span>
                  {t.tags.topics.slice(0, 3).map((tp) => (
                    <button key={tp} className="rv-rev-topic" onClick={() => setParam("topic", tp)}>{tp}</button>
                  ))}
                  <span className="rv-review-author">{r.author ?? "Anonymous"}</span>
                  <span className="rv-dot">·</span>
                  <span>{r.country}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---- shared period selector (+ optional Refresh, matching appkittie) ---- */
function PeriodChips({
  days,
  onChange,
  onRefresh,
  refreshing,
  children,
}: {
  days: number | null;
  onChange: (d: number | null) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="rv-period">
      <span className="rv-period-label">Period</span>
      {PERIODS.map((p) => (
        <button key={p.label} className={`rv-chip ${days === p.days ? "on" : ""}`} onClick={() => onChange(p.days)}>{p.label}</button>
      ))}
      {children}
      {onRefresh && (
        <>
          <span className="rv-period-spacer" />
          <button
            className="rv-refresh"
            onClick={onRefresh}
            disabled={refreshing}
            title="Fetch latest reviews for this app"
          >
            <IconRefresh className={refreshing ? "rv-spin" : ""} style={{ width: 13, height: 13 }} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </>
      )}
    </div>
  );
}

/* ============================================================ Semantics (REAL aggregation · interim tags) */
export function SemanticsTab({ tagged, onRefresh, refreshing }: { tagged: TaggedReview[]; onRefresh?: () => void; refreshing?: boolean }) {
  const [days, setDays] = useState<number | null>(null);
  const ts = useMemo(() => topicTimeSeries(tagged, days), [tagged, days]);
  const trend = useMemo(() => toTrend(ts), [ts]);
  const maxMentions = Math.max(1, ...ts.rows.map((r) => r.totalMentions));
  const gran = GRANULARITY_LABEL[ts.granularity];

  return (
    <div className="rv-semantics">
      <PeriodChips days={days} onChange={setDays} onRefresh={onRefresh} refreshing={refreshing} />
      <MockNotice>{INTERIM_NOTE}</MockNotice>

      {ts.rows.length === 0 ? (
        <EmptyState icon={<IconSearch />} title="No topics in this period" sub="Widen the period or load more reviews to surface themes." />
      ) : (
        <>
          {/* Topic trends chart */}
          <section className="rv-card">
            <div className="rv-card-head">
              <div className="rv-card-title">Topic trends</div>
              <span className="rv-card-meta">mentions / {gran} · top {Math.min(4, ts.rows.length)} shown · hover a topic to isolate</span>
            </div>
            <TrendChart periods={trend.periods} series={trend.series} />
          </section>

          {/* Topics table — each row carries a compact trend sparkline, so the
              per-topic history lives here instead of in a wide numeric matrix */}
          <section className="rv-card">
            <div className="rv-card-head">
              <div className="rv-card-title">Topics ({ts.rows.length})</div>
              <span className="rv-card-meta">{formatCompact(tagged.length)} reviews tagged · trend / {gran}</span>
            </div>
            <div className="rv-topic-table">
              <div className="rv-topic-h">
                <span>Topic</span><span>Trend</span><span>Sentiment</span><span>Rating</span><span>Mentions</span>
              </div>
              {ts.rows.map((r) => (
                <div className="rv-topic-row" key={r.label}>
                  <span className="rv-topic-name">{r.label}</span>
                  <span className="rv-topic-spark">
                    <Sparkline values={ts.periods.map((p) => r.periodValues[p.key] ?? 0)} color={SENTIMENT_COLOR[r.sentiment]} />
                  </span>
                  <span className="rv-topic-sent" style={{ color: SENTIMENT_COLOR[r.sentiment] }}>
                    <i style={{ background: SENTIMENT_COLOR[r.sentiment] }} />{SENTIMENT_LABEL[r.sentiment]}
                  </span>
                  <span className="rv-topic-rating">{r.avgRating.toFixed(1)}</span>
                  <span className="rv-topic-bar">
                    <span className="rv-topic-fill" style={{ width: `${(r.totalMentions / maxMentions) * 100}%`, background: SENTIMENT_COLOR[r.sentiment] }} />
                    <span className="rv-topic-n">{r.totalMentions}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/* ============================================================ Improvements (REAL aggregation · interim tags) */
type ImpFilter = "all" | "needs" | "strength";

/** Improvements use a deliberately simple binary scale — green = doing well,
   red = needs work — no purple/grey. An area "needs work" if its sentiment
   leans negative/mixed or its average rating is below 3.5. */
function impTone(a: { sentiment: Sentiment4; avgRating: number }): { color: string; label: string } {
  const needsWork = a.sentiment === "negative" || a.sentiment === "mixed" || a.avgRating < 3.5;
  return needsWork
    ? { color: "var(--negative)", label: "Needs work" }
    : { color: "var(--positive)", label: "Doing well" };
}

export function ImprovementsTab({ tagged, onRefresh, refreshing }: { tagged: TaggedReview[]; onRefresh?: () => void; refreshing?: boolean }) {
  const navigate = useNavigate();
  const [days, setDays] = useState<number | null>(null);
  const [filter, setFilter] = useState<ImpFilter>("all");
  const { improvements, totalMentions } = useMemo(() => improvementAreas(tagged, days), [tagged, days]);
  const impTs = useMemo(() => improvementTimeSeries(tagged, days), [tagged, days]);
  const impTrend = useMemo(() => toTrend(impTs), [impTs]);
  const impGran = GRANULARITY_LABEL[impTs.granularity];

  const shown = improvements.filter((a) => {
    if (filter === "needs") return a.sentiment === "negative" || a.avgRating < 3;
    if (filter === "strength") return a.sentiment === "positive" && a.avgRating >= 3.5;
    return true;
  });

  return (
    <div className="rv-improvements">
      <PeriodChips days={days} onChange={setDays} onRefresh={onRefresh} refreshing={refreshing}>
        <span className="rv-period-spacer" />
        {(["all", "needs", "strength"] as ImpFilter[]).map((k) => (
          <button key={k} className={`rv-chip ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>
            {k === "all" ? "All" : k === "needs" ? "Needs Work" : "Strengths"}
          </button>
        ))}
      </PeriodChips>
      <MockNotice>{INTERIM_NOTE}</MockNotice>

      {shown.length === 0 ? (
        <EmptyState icon={<IconSpark />} title="No improvement areas here" sub="Try a different filter or a wider period." />
      ) : (
        <>
          {/* Improvement trends chart */}
          <section className="rv-card">
            <div className="rv-card-head">
              <div className="rv-card-title">Improvement trends</div>
              <span className="rv-card-meta">mentions / {impGran} · top {Math.min(4, impTs.rows.length)} shown · hover an area to isolate</span>
            </div>
            <TrendChart periods={impTrend.periods} series={impTrend.series} />
          </section>

          <div className="rv-imp-head">{formatCompact(totalMentions)} total mentions · {shown.length} areas</div>
          <div className="rv-area-grid">
            {shown.map((a) => {
              const tone = impTone(a);
              return (
                <button
                  className="rv-area"
                  key={a.id}
                  onClick={() => navigate(`/reviews/reviews?area=${encodeURIComponent(a.category)}`)}
                  title={`See the ${a.mentionCount} review${a.mentionCount === 1 ? "" : "s"} about ${a.category}`}
                >
                  <div className="rv-area-top">
                    <span className="rv-area-name">{a.category}</span>
                    <span className="rv-area-dot" style={{ background: tone.color }} title={tone.label} />
                  </div>
                  <div className="rv-area-meta">
                    <span className="rv-area-rating" style={{ color: tone.color }}>
                      <IconStar style={{ width: 12, height: 12, color: tone.color }} />{a.avgRating.toFixed(1)}
                    </span>
                    <span className="rv-area-mentions">
                      {formatCompact(a.mentionCount)} mention{a.mentionCount === 1 ? "" : "s"} ({Math.round(a.share * 100)}%)
                    </span>
                  </div>
                  <div className="rv-area-bar">
                    <span style={{ width: `${Math.max(4, a.share * 100)}%`, background: tone.color }} />
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
