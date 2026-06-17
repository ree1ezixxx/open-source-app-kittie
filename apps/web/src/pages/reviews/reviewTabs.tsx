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
  SERIES_PALETTE,
  GRANULARITY_LABEL,
  type TaggedReview,
  type Sentiment4,
  type DimensionTimeSeries,
} from "../../lib/api/reviewIntel";
import { TrendChart, type TrendSeries } from "../../components/reviews/TrendChart";
import { EmptyState, MockNotice } from "../../components/reviews/primitives";
import { formatCompact } from "../../lib/format";
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

/* Sentiment is a 3-way indicator: Positive (green), Negative (red), Mixed
   (orange). The classifier's "neutral" folds into Mixed so there are exactly
   three buckets, matching the reference. Topics get their OWN distinct colours
   (SERIES_PALETTE) — sentiment colour and topic colour are separate systems. */
type Sent3 = "positive" | "negative" | "mixed";
function sent3(s: Sentiment4): Sent3 {
  if (s === "positive") return "positive";
  if (s === "negative") return "negative";
  return "mixed"; // neutral + mixed
}
const SENT3_COLOR: Record<Sent3, string> = { positive: "#5fd08a", negative: "#ff7a6b", mixed: "#f5a623" };
const SENT3_LABEL: Record<Sent3, string> = { positive: "Positive", negative: "Negative", mixed: "Mixed" };
// 4-way (truth parity for the Feed): Neutral is its own bucket, not folded into Mixed.
const SENT_COLOR: Record<Sentiment4, string> = { positive: "#5fd08a", neutral: "#9a9aa3", negative: "#ff7a6b", mixed: "#f5a623" };
const SENT_LABEL: Record<Sentiment4, string> = { positive: "Positive", neutral: "Neutral", negative: "Negative", mixed: "Mixed" };
/** Absolute review date, e.g. "Jun 16, 2026" (truth shows absolute, not relative). */
function fmtReviewDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(+d) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
const topicColor = (i: number) => SERIES_PALETTE[i % SERIES_PALETTE.length] ?? "#888";

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

/** Convert a dimension time-series into multi-series trend-chart input.
    Each topic gets its own distinct colour (like the reference) so lines are
    individually identifiable; sentiment is conveyed separately. */
function toTrend(ts: DimensionTimeSeries): { periods: string[]; series: TrendSeries[] } {
  return {
    periods: ts.periods.map((p) => p.label),
    series: ts.rows.map((r, i) => ({
      key: r.label,
      label: r.label,
      color: topicColor(i),
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
            <span style={{ width: `${pos * 100}%`, background: "#5fd08a" }} />
            <span style={{ width: `${neu * 100}%`, background: "#f5a623" }} />
            <span style={{ width: `${neg * 100}%`, background: "#ff7a6b" }} />
          </div>
          <div className="rv-sent-legend">
            <span><i style={{ background: "#5fd08a" }} />Positive {Math.round(pos * 100)}%</span>
            <span><i style={{ background: "#f5a623" }} />Mixed {Math.round(neu * 100)}%</span>
            <span><i style={{ background: "#ff7a6b" }} />Negative {Math.round(neg * 100)}%</span>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ============================================================ Reviews (feed) */
type RatingFilter = "all" | "5" | "4" | "3" | "2" | "1";
type SentFilter = "all" | Sentiment4;

export function ReviewsTab({ tagged }: { tagged: TaggedReview[] }) {
  const [sp, setSp] = useSearchParams();

  // Feed filters all live in the URL — reload-safe + shareable, like truth (?sentiment=…).
  const rating = (sp.get("rating") ?? "all") as RatingFilter;
  const sentiment = (sp.get("sentiment") ?? "all") as SentFilter;
  const days = sp.get("period") ? Number(sp.get("period")) : null;
  const q = sp.get("q") ?? "";
  const topic = sp.get("topic");
  const area = sp.get("improvementArea");
  const page = Math.max(1, Number(sp.get("page") || "1"));
  const PAGE_SIZE = 20;
  const FACET_CAP = 8; // truth shows ~8 facet chips then "+N more"

  // single URL writer; any filter change resets pagination unless keepPage
  const update = (patch: Record<string, string | null>, keepPage = false) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "" || v === "all") next.delete(k);
      else next.set(k, v);
    }
    if (!keepPage) next.delete("page");
    setSp(next, { replace: true });
  };

  const [growthMetric, setGrowthMetric] = useState<"new" | "total">("total");
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [impsOpen, setImpsOpen] = useState(false);

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
    return [...list].sort((a, b) => +new Date(b.review.reviewedAt) - +new Date(a.review.reviewedAt));
  }, [periodSet, rating, sentiment, topic, area, q]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const end = Math.min(safePage * PAGE_SIZE, total);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Truth order: All / Positive / Negative / Neutral / Mixed (5-way, Neutral distinct).
  const SENTS: SentFilter[] = ["all", "positive", "negative", "neutral", "mixed"];
  const tShown = topicsOpen ? tFacets : tFacets.slice(0, FACET_CAP);
  const iShown = impsOpen ? iFacets : iFacets.slice(0, FACET_CAP);

  return (
    <div className="rv-reviews">
      {/* Review Growth — historical metrics accrue from daily snapshots; empty until then (matches truth) */}
      <div className="rv-card rv-growth">
        <div className="rv-growth-head">
          <h3 className="rv-card-title">Review Growth</h3>
          <div className="rv-rating-seg rv-growth-toggle">
            <button className={`rv-seg-btn ${growthMetric === "new" ? "on" : ""}`} onClick={() => setGrowthMetric("new")}>New</button>
            <button className={`rv-seg-btn ${growthMetric === "total" ? "on" : ""}`} onClick={() => setGrowthMetric("total")}>Total</button>
          </div>
        </div>
        <div className="rv-growth-periods">
          <span className="rv-period-label">Period:</span>
          {PERIODS.map((p) => (
            <button key={p.label} className={`rv-chip ${days === p.days ? "on" : ""}`} onClick={() => update({ period: p.days ? String(p.days) : null })}>{p.label}</button>
          ))}
        </div>
        <div className="rv-growth-empty">No historical review metrics yet</div>
      </div>

      {/* search + rating + sentiment */}
      <div className="rv-filters">
        <div className="search rv-search">
          <IconSearch />
          <input placeholder="Search reviews…" value={q} onChange={(e) => update({ q: e.target.value || null })} />
        </div>
        <div className="rv-rating-seg">
          {(["all", "5", "4", "3", "2", "1"] as RatingFilter[]).map((r) => (
            <button key={r} className={`rv-seg-btn ${rating === r ? "on" : ""}`} onClick={() => update({ rating: r })}>
              {r === "all" ? "All" : <>{r}<IconStar style={{ width: 11, height: 11, color: rating === r ? "#f5c451" : "currentColor" }} /></>}
            </button>
          ))}
        </div>
        <div className="rv-rating-seg">
          {SENTS.map((s) => (
            <button key={s} className={`rv-seg-btn ${sentiment === s ? "on" : ""}`} onClick={() => update({ sentiment: s })}>
              {s === "all" ? "All" : SENT_LABEL[s as Sentiment4]}
              {s !== "all" && <span className="rv-seg-n">{sFacet[s as Sentiment4]}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* topic facets */}
      {tFacets.length > 0 && (
        <div className="rv-facets">
          <span className="rv-facet-label">Topics</span>
          <button className={`rv-chip ${!topic ? "on" : ""}`} onClick={() => update({ topic: null })}>All</button>
          {tShown.map((f) => (
            <button key={f.label} className={`rv-chip ${topic === f.label ? "on" : ""}`} onClick={() => update({ topic: topic === f.label ? null : f.label })}>
              {f.label}<span className="rv-chip-n">{f.count}</span>
            </button>
          ))}
          {tFacets.length > FACET_CAP && (
            <button className="rv-facet-more" onClick={() => setTopicsOpen((v) => !v)}>
              {topicsOpen ? "Show less" : `+${tFacets.length - FACET_CAP} more`}
            </button>
          )}
        </div>
      )}

      {/* improvement facets */}
      {iFacets.length > 0 && (
        <div className="rv-facets">
          <span className="rv-facet-label">Improvements</span>
          <button className={`rv-chip ${!area ? "on" : ""}`} onClick={() => update({ improvementArea: null })}>All</button>
          {iShown.map((f) => (
            <button key={f.label} className={`rv-chip ${area === f.label ? "on" : ""}`} onClick={() => update({ improvementArea: area === f.label ? null : f.label })}>
              {f.label}<span className="rv-chip-n">{f.count}</span>
            </button>
          ))}
          {iFacets.length > FACET_CAP && (
            <button className="rv-facet-more" onClick={() => setImpsOpen((v) => !v)}>
              {impsOpen ? "Show less" : `+${iFacets.length - FACET_CAP} more`}
            </button>
          )}
        </div>
      )}

      {total === 0 ? (
        <EmptyState
          icon={<IconSearch />}
          title="No reviews match these filters"
          sub="Try clearing a filter or widening the period."
        />
      ) : (
        <>
          <div className="rv-feed-grid">
            {pageItems.map((t) => {
              const r = t.review;
              const tags = [...t.tags.topics, ...t.tags.improvementAreas].slice(0, 5);
              const who = (r.author ?? "Anonymous").trim() || "Anonymous";
              return (
                <article className="rv-rcard" key={r.id}>
                  <div className="rv-rcard-head">
                    <Stars value={Math.round(r.rating)} />
                    <span className="rv-rcard-sent" style={{ color: SENT_COLOR[t.tags.sentiment], borderColor: SENT_COLOR[t.tags.sentiment] }}>
                      {SENT_LABEL[t.tags.sentiment]}
                    </span>
                  </div>
                  {r.title && <h4 className="rv-rcard-title">{r.title}</h4>}
                  <p className="rv-rcard-body">{r.body}</p>
                  {tags.length > 0 && (
                    <div className="rv-rcard-tags">
                      {tags.map((tp) => (
                        <button key={tp} className="rv-rev-topic" onClick={() => update({ topic: tp })}>{tp}</button>
                      ))}
                    </div>
                  )}
                  <div className="rv-rcard-author">
                    <span className="rv-rcard-avatar" aria-hidden>{who.charAt(0).toUpperCase()}</span>
                    <span className="rv-rcard-name">{who}</span>
                    <span className="rv-rcard-date">{fmtReviewDate(r.reviewedAt)}</span>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="rv-pager">
            <span className="rv-pager-info">Showing <b>{start}</b>–<b>{end}</b> of <b>{formatCompact(total)}</b></span>
            <div className="rv-pager-btns">
              <button className="rv-pager-btn" disabled={safePage <= 1} onClick={() => update({ page: String(safePage - 1) }, true)} aria-label="Previous page">‹</button>
              <button className="rv-pager-btn" disabled={safePage >= pageCount} onClick={() => update({ page: String(safePage + 1) }, true)} aria-label="Next page">›</button>
            </div>
          </div>
        </>
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
              {ts.rows.map((r, i) => (
                <div className="rv-topic-row" key={r.label}>
                  <span className="rv-topic-name"><i className="rv-topic-swatch" style={{ background: topicColor(i) }} />{r.label}</span>
                  <span className="rv-topic-spark">
                    <Sparkline values={ts.periods.map((p) => r.periodValues[p.key] ?? 0)} color={topicColor(i)} />
                  </span>
                  <span className="rv-topic-sent" style={{ color: SENT3_COLOR[sent3(r.sentiment)] }}>
                    <i style={{ background: SENT3_COLOR[sent3(r.sentiment)] }} />{SENT3_LABEL[sent3(r.sentiment)]}
                  </span>
                  <span className="rv-topic-rating">{r.avgRating.toFixed(1)}</span>
                  <span className="rv-topic-bar">
                    <span className="rv-topic-fill" style={{ width: `${(r.totalMentions / maxMentions) * 100}%`, background: topicColor(i) }} />
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
                  onClick={() => navigate(`/reviews/feed?improvementArea=${encodeURIComponent(a.category)}`)}
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
