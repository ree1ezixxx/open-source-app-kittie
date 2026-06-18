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
  type MonitoredApp,
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
import { EmptyState } from "../../components/reviews/primitives";
import { formatCompact } from "../../lib/format";
import { IconStar, IconSearch, IconSpark, IconChart, IconUsers, IconMessage, IconExternal } from "../../icons";

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

/* Sentiment is a 4-way indicator (truth parity): Positive (green), Neutral
   (grey), Negative (red), Mixed (orange). Topics get their OWN distinct
   colours (SERIES_PALETTE) — sentiment colour and topic colour are separate. */
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
  { label: "7 days", days: 7 },
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "180 days", days: 180 },
];


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
/** Top topic/area labels among reviews of the given sentiments (frequency-ranked). */
function topLabelsBySentiment(
  tagged: TaggedReview[],
  sentiments: Sentiment4[],
  pick: "topics" | "improvementAreas",
  n: number,
): string[] {
  const counts = new Map<string, number>();
  for (const t of tagged) {
    if (!sentiments.includes(t.tags.sentiment)) continue;
    for (const x of t.tags[pick]) counts.set(x, (counts.get(x) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

export function OverviewTab({
  tagged, appsMonitored, isAll, monitored, indexed, appName, onSelectApp, onViewReviews,
}: {
  tagged: TaggedReview[];
  appsMonitored: number;
  isAll: boolean;
  monitored: MonitoredApp[];
  indexed: Record<string, number>;
  appName: string | null;
  onSelectApp: (id: string) => void;
  onViewReviews: () => void;
}) {
  if (isAll) {
    return <AggregateOverview tagged={tagged} appsMonitored={appsMonitored} monitored={monitored} indexed={indexed} onSelectApp={onSelectApp} />;
  }
  return <SingleAppOverview tagged={tagged} appName={appName} onViewReviews={onViewReviews} />;
}

/* ---- aggregate (All Apps): KPIs + Your Apps grid ---- */
function AggregateOverview({
  tagged, appsMonitored, monitored, indexed, onSelectApp,
}: {
  tagged: TaggedReview[];
  appsMonitored: number;
  monitored: MonitoredApp[];
  indexed: Record<string, number>;
  onSelectApp: (id: string) => void;
}) {
  const reviews = tagged.map((t) => t.review);
  const avg = averageRating(reviews);
  const total = reviews.length;
  return (
    <div className="rv-overview">
      <div className="rv-kpis">
        <div className="rv-kpi">
          <div className="rv-kpi-ic"><IconMessage style={{ width: 17, height: 17 }} /></div>
          <div><div className="rv-kpi-num">{formatCompact(total)}</div><div className="rv-kpi-label">Total Reviews</div></div>
        </div>
        <div className="rv-kpi">
          <div className="rv-kpi-ic"><IconStar style={{ width: 17, height: 17 }} /></div>
          <div><div className="rv-kpi-num">{avg != null ? avg.toFixed(1) : "—"}</div><div className="rv-kpi-label">Average Rating</div></div>
        </div>
        <div className="rv-kpi">
          <div className="rv-kpi-ic"><IconChart style={{ width: 17, height: 17 }} /></div>
          <div><div className="rv-kpi-num">{appsMonitored}</div><div className="rv-kpi-label">Apps Monitored</div></div>
        </div>
      </div>

      <div className="rv-yourapps-head">
        <h2 className="rv-section-title">Your Apps</h2>
        <span className="rv-card-meta">{appsMonitored} app{appsMonitored === 1 ? "" : "s"} monitored</span>
      </div>
      <div className="rv-yourapps-grid">
        {monitored.map((a) => (
          <button className="rv-card rv-appcard" key={a.id} onClick={() => onSelectApp(a.id)}>
            <div className="rv-appcard-head">
              {a.iconUrl
                ? <img className="rv-appcard-ic" src={a.iconUrl} alt="" referrerPolicy="no-referrer" />
                : <span className="rv-appcard-ic rv-appcard-ph">{a.title.charAt(0)}</span>}
              <div className="rv-appcard-meta">
                <div className="rv-appcard-name">{a.title}</div>
                <div className="rv-appcard-dev">{a.developer}</div>
              </div>
            </div>
            <div className="rv-appcard-foot">
              <span className="rv-num">{indexed[a.id] != null ? formatCompact(indexed[a.id]!) : "…"}</span> reviews
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---- single app: the rich dashboard (alerts · rating · reviews · AI summary · feedback) ---- */
function SingleAppOverview({
  tagged, appName, onViewReviews,
}: {
  tagged: TaggedReview[];
  appName: string | null;
  onViewReviews: () => void;
}) {
  const reviews = tagged.map((t) => t.review);
  const dist = ratingDistribution(reviews);
  const avg = averageRating(reviews);
  const total = reviews.length;
  const maxBar = Math.max(1, ...([5, 4, 3, 2, 1] as const).map((k) => dist[k]));

  const sent = sentimentCounts(tagged);
  const sTotal = total || 1;
  const posPct = Math.round((sent.positive / sTotal) * 100);
  const negPct = Math.round((sent.negative / sTotal) * 100);
  const net = posPct - negPct;

  const topTopics = useMemo(() => topicFacets(tagged).slice(0, 10), [tagged]);
  const love = useMemo(() => topLabelsBySentiment(tagged, ["positive", "mixed"], "topics", 5), [tagged]);
  const needs = useMemo(() => {
    const a = topLabelsBySentiment(tagged, ["negative", "mixed"], "improvementAreas", 5);
    return a.length ? a : topLabelsBySentiment(tagged, ["negative", "mixed"], "topics", 5);
  }, [tagged]);
  const insights = useMemo(() => improvementFacets(tagged).slice(0, 6), [tagged]);
  const insightMax = Math.max(1, ...insights.map((i) => i.count));
  const minutesSaved = Math.round(total * 0.5);
  const skew = net > 8 ? "skews positive" : net < -8 ? "skews negative" : "is mixed";
  const summary =
    `Across ${formatCompact(total)} analysed reviews, sentiment ${skew} (${posPct}% positive, ${negPct}% negative).` +
    (topTopics.length ? ` Users most often discuss ${topTopics.slice(0, 3).map((t) => t.label).join(", ")}.` : "");

  return (
    <div className="rv-overview">
      {/* Review alerts (UI; delivery deferred) */}
      <section className="rv-card rv-alerts">
        <div className="rv-card-head">
          <div className="rv-card-title">Review alerts</div>
          <span className="rv-alerts-stats">0 alert rules · Email available · Slack optional</span>
        </div>
        <p className="rv-alerts-intro">
          We'll alert you as soon as a new review is detected{appName ? ` for ${appName}` : ""}, so you can jump in and respond quickly.
        </p>
        <div className="rv-alerts-empty">
          <div className="rv-alerts-empty-title">No alerts configured yet</div>
          <div className="rv-alerts-empty-sub">Add an email alert or connect Slack so fresh reviews reach your team right away.</div>
          <div className="rv-alerts-actions">
            <button className="btn btn-accent" title="Alerts delivery is coming soon">Add email alert</button>
            <button className="btn" title="Slack integration is coming soon">Connect Slack</button>
          </div>
        </div>
      </section>

      <div className="rv-grid-2">
        {/* Rating */}
        <section className="rv-card">
          <div className="rv-card-head"><div className="rv-card-title">Rating</div></div>
          <div className="rv-avg">
            <div className="rv-avg-num">{avg != null ? avg.toFixed(2) : "—"}</div>
            <div>
              <Stars value={Math.round(avg ?? 0)} size={15} />
              <div className="rv-avg-sub">{formatCompact(total)} reviews · based on reviews with comments only</div>
            </div>
          </div>
          <div className="rv-dist">
            {([5, 4, 3, 2, 1] as const).map((k) => (
              <div className="rv-dist-row" key={k}>
                <span className="rv-dist-k">{k}<IconStar style={{ width: 11, height: 11, color: "#f5c451" }} /></span>
                <span className="rv-dist-track">
                  <span className="rv-dist-fill" style={{ width: `${(dist[k] / maxBar) * 100}%`, background: k >= 4 ? "var(--positive)" : k === 3 ? "#f5b545" : "var(--negative)" }} />
                </span>
                <span className="rv-dist-n">{formatCompact(dist[k])}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Reviews */}
        <section className="rv-card">
          <div className="rv-card-head"><div className="rv-card-title">Reviews</div></div>
          <div className="rv-revstats">
            <div className="rv-revstat"><div className="rv-revstat-num rv-num">{formatCompact(total)}</div><div className="rv-revstat-label">total reviews</div></div>
            <div className="rv-revstat"><div className="rv-revstat-num rv-num">{avg != null ? avg.toFixed(2) : "—"}</div><div className="rv-revstat-label">avg. review rating</div></div>
            <div className="rv-revstat"><div className="rv-revstat-num rv-num" style={{ color: "var(--positive)" }}>{posPct}%</div><div className="rv-revstat-label">positive</div></div>
            <div className="rv-revstat"><div className="rv-revstat-num rv-num" style={{ color: "var(--negative)" }}>{negPct}%</div><div className="rv-revstat-label">negative</div></div>
          </div>
          <div className="rv-sent-bar">
            <span style={{ width: `${posPct}%`, background: "#5fd08a" }} />
            <span style={{ width: `${Math.max(0, 100 - posPct - negPct)}%`, background: "#f5a623" }} />
            <span style={{ width: `${negPct}%`, background: "#ff7a6b" }} />
          </div>
        </section>
      </div>

      {/* AI Summary (interim heuristic model — not LLM yet) */}
      <section className="rv-card rv-aisum">
        <div className="rv-card-head">
          <div className="rv-card-title"><IconSpark style={{ width: 15, height: 15 }} /> AI Summary</div>
          <span className="rv-mock-badge">interim model</span>
        </div>
        <div className="rv-aisum-stats">
          <span><b className="rv-num">{formatCompact(total)}</b> reviews</span>
          <span><b className="rv-num">{avg != null ? avg.toFixed(1) : "—"}</b> avg</span>
          <span>~<b className="rv-num">{formatCompact(minutesSaved)}</b> min saved</span>
        </div>
        <p className="rv-aisum-text">{summary}</p>
        {topTopics.length > 0 && (
          <>
            <div className="rv-aisum-label">Top topics</div>
            <div className="rv-aisum-chips">
              {topTopics.map((t) => <span className="rv-chip" key={t.label}>{t.label}<span className="rv-chip-n">{t.count}</span></span>)}
            </div>
          </>
        )}
        <div className="rv-aisum-cols">
          <div>
            <div className="rv-aisum-label rv-aisum-love">What users love</div>
            <ul className="rv-aisum-list">{love.length ? love.map((x) => <li key={x}>{x}</li>) : <li className="rv-muted">Not enough positive reviews yet</li>}</ul>
          </div>
          <div>
            <div className="rv-aisum-label rv-aisum-needs">What needs work</div>
            <ul className="rv-aisum-list">{needs.length ? needs.map((x) => <li key={x}>{x}</li>) : <li className="rv-muted">Not enough critical reviews yet</li>}</ul>
          </div>
        </div>
      </section>

      {/* Feedback Insights */}
      <section className="rv-card rv-feedback">
        <div className="rv-card-head">
          <div className="rv-card-title">Feedback Insights</div>
          <span className="rv-card-meta"><b className="rv-num">{posPct}%</b> total satisfaction</span>
        </div>
        <div className="rv-feedback-bars">
          {insights.map((i) => (
            <div className="rv-feedback-row" key={i.label}>
              <span className="rv-feedback-label">{i.label}</span>
              <span className="rv-feedback-track"><span className="rv-feedback-fill" style={{ width: `${(i.count / insightMax) * 100}%` }} /></span>
              <span className="rv-feedback-n rv-num">{formatCompact(i.count)}</span>
            </div>
          ))}
          {insights.length === 0 && <div className="rv-muted">No improvement areas surfaced yet</div>}
        </div>
        <button className="rv-viewall" onClick={onViewReviews}>View all reviews <IconExternal style={{ width: 13, height: 13 }} /></button>
      </section>
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
  // truth defaults the feed to a 30-day window; "all" is an explicit sentinel
  const periodParam = sp.get("period");
  const days = periodParam === "all" ? null : periodParam ? Number(periodParam) : 30;
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
            <button key={p.label} className={`rv-chip ${days === p.days ? "on" : ""}`} onClick={() => update({ period: p.days == null ? "all" : String(p.days) })}>{p.label}</button>
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
              const tags = [
                ...t.tags.topics.map((label) => ({ label, kind: "topic" as const })),
                ...t.tags.improvementAreas.map((label) => ({ label, kind: "area" as const })),
              ].slice(0, 5);
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
                      {tags.map((tg) => (
                        <button
                          key={`${tg.kind}:${tg.label}`}
                          className="rv-rev-topic"
                          onClick={() => update(tg.kind === "topic" ? { topic: tg.label } : { improvementArea: tg.label })}
                        >
                          {tg.label}
                        </button>
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
  // Refresh lives beside the app selector (truth) — not in the period row.
  void onRefresh; void refreshing;
  return (
    <div className="rv-period">
      <span className="rv-period-label">Period:</span>
      {PERIODS.map((p) => (
        <button key={p.label} className={`rv-chip ${days === p.days ? "on" : ""}`} onClick={() => onChange(p.days)}>{p.label}</button>
      ))}
      {children}
    </div>
  );
}

/* ============================================================ Semantics (REAL aggregation · interim tags) */
export function SemanticsTab({ tagged, onRefresh, refreshing }: { tagged: TaggedReview[]; onRefresh?: () => void; refreshing?: boolean }) {
  const [days, setDays] = useState<number | null>(null);
  const ts = useMemo(() => topicTimeSeries(tagged, days), [tagged, days]);
  const trend = useMemo(() => toTrend(ts), [ts]);
  const gran = GRANULARITY_LABEL[ts.granularity];

  return (
    <div className="rv-semantics">
      <PeriodChips days={days} onChange={setDays} onRefresh={onRefresh} refreshing={refreshing} />

      {ts.rows.length === 0 ? (
        <EmptyState icon={<IconSearch />} title="No topics in this period" sub="Widen the period or load more reviews to surface themes." />
      ) : (
        <>
          {/* Topic Trends chart */}
          <section className="rv-card">
            <div className="rv-card-head">
              <div className="rv-card-title">Topic Trends <span className="rv-mock-badge">interim model</span></div>
              <span className="rv-card-meta">mentions / {gran} · top {Math.min(4, ts.rows.length)} shown · hover a topic to isolate</span>
            </div>
            <TrendChart periods={trend.periods} series={trend.series} />
          </section>

          {/* Topic Timeline — per-date mention matrix (truth parity) */}
          <section className="rv-card">
            <div className="rv-card-head">
              <div className="rv-card-title">Topic Timeline</div>
              <span className="rv-card-meta">{ts.rows.length} topics across {ts.periods.length} {gran}{ts.periods.length === 1 ? "" : "s"}</span>
            </div>
            <div className="rv-timeline-wrap">
              <table className="rv-timeline">
                <thead>
                  <tr>
                    <th className="rv-tl-topic">Topic</th>
                    <th>Sentiment</th>
                    <th className="rv-tl-rt">Rating</th>
                    <th className="rv-tl-rt">Total</th>
                    {ts.periods.map((p) => <th key={p.key} className="rv-tl-date">{p.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {ts.rows.map((r, i) => (
                    <tr key={r.label}>
                      <td className="rv-tl-topic"><i className="rv-topic-swatch" style={{ background: topicColor(i) }} />{r.label}</td>
                      <td><span className="rv-tl-sent" style={{ color: SENT_COLOR[r.sentiment] }}><i style={{ background: SENT_COLOR[r.sentiment] }} />{SENT_LABEL[r.sentiment]}</span></td>
                      <td className="rv-tl-rt rv-num">{r.avgRating.toFixed(1)}</td>
                      <td className="rv-tl-rt rv-num">{r.totalMentions}</td>
                      {ts.periods.map((p) => {
                        const v = r.periodValues[p.key];
                        return <td key={p.key} className={`rv-tl-cell rv-num ${v ? "" : "rv-tl-zero"}`}>{v || "—"}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
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
  const [sp] = useSearchParams();
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

      {shown.length === 0 ? (
        <EmptyState icon={<IconSpark />} title="No improvement areas here" sub="Try a different filter or a wider period." />
      ) : (
        <>
          {/* Improvement Trends chart */}
          <section className="rv-card">
            <div className="rv-card-head">
              <div className="rv-card-title">Improvement Trends <span className="rv-mock-badge">interim model</span></div>
              <span className="rv-card-meta">mentions / {impGran} · top {Math.min(4, impTs.rows.length)} shown · hover an area to isolate</span>
            </div>
            <TrendChart periods={impTrend.periods} series={impTrend.series} />
          </section>

          <h2 className="rv-section-title rv-imp-head">Improvement Areas <span className="rv-card-meta">{formatCompact(totalMentions)} total mentions</span></h2>
          <div className="rv-area-grid">
            {shown.map((a) => {
              const tone = impTone(a);
              return (
                <button
                  className="rv-area"
                  key={a.id}
                  onClick={() => {
                    const qs = new URLSearchParams({ improvementArea: a.category });
                    const app = sp.get("app");
                    if (app) qs.set("app", app); // keep the selected app — don't reset to monitored[0]
                    navigate(`/reviews/feed?${qs.toString()}`);
                  }}
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
