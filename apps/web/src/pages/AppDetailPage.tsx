import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { AppDetail, AppHistoricalPoint, Review } from "@kittie/types";
import { getApp, getReviews } from "../lib/api";
import type { Theme } from "../lib/theme";
import { categoryColor, pillStyle } from "../lib/palette";
import { formatCompact, formatMoney, formatRating, formatDate } from "../lib/format";
import { MetricCard, type MetricDelta } from "../components/MetricCard";
import { DetailCard, EmptyCard, Fact } from "../components/DetailCard";
import { TrendPanel, type ChartMetric } from "../components/TrendPanel";
import { SimilarApps } from "../components/SimilarApps";
import { FavoriteToggle } from "../components/FavoriteToggle";
import { Lightbox } from "../components/Lightbox";
import {
  IconArrowLeft,
  IconStar,
  IconApple,
  IconGooglePlay,
  IconSpark,
  IconInfo,
  IconChart,
  IconUsers,
  IconCoin,
  IconSun,
  IconMoon,
  IconExternal,
  IconImage,
  IconGlobe,
  IconMessage,
} from "../icons";

const MIN_COLLECTION = 3;

/** % change of a historical series, for the headline-card delta. Null until 2+ snapshots. */
function pctDelta(historicals: AppHistoricalPoint[], key: keyof AppHistoricalPoint): MetricDelta | null {
  const series = historicals
    .map((p) => p[key])
    .filter((v): v is number => typeof v === "number");
  if (series.length < 2) return null;
  const first = series[0]!;
  const last = series[series.length - 1]!;
  if (!first) return null;
  const pct = ((last - first) / first) * 100;
  return { label: `${Math.abs(pct).toFixed(1)}%`, dir: pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat" };
}

export function AppDetailPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [app, setApp] = useState<AppDetail | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [chartMetric, setChartMetric] = useState<ChartMetric>("downloadsEstimate");
  const [media, setMedia] = useState<{ status: "probing" | "ready"; working: string[] }>({
    status: "probing",
    working: [],
  });

  useEffect(() => {
    if (!id) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setApp(null);
    setLightbox(null);
    setReviews(null);
    setChartMetric("downloadsEstimate");
    getApp(decodeURIComponent(id), ac.signal)
      .then((d) => !ac.signal.aborted && setApp(d))
      .catch((e) => !ac.signal.aborted && setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => !ac.signal.aborted && setLoading(false));
    getReviews(decodeURIComponent(id), ac.signal)
      .then((r) => !ac.signal.aborted && setReviews(r))
      .catch(() => !ac.signal.aborted && setReviews([]));
    return () => ac.abort();
  }, [id]);

  // Probe screenshots in-browser; only show a real working collection.
  useEffect(() => {
    if (!app) return;
    const urls = app.screenshotUrls;
    if (urls.length === 0) {
      setMedia({ status: "ready", working: [] });
      return;
    }
    setMedia({ status: "probing", working: [] });
    let cancelled = false;
    const results: (string | null)[] = new Array(urls.length).fill(null);
    let done = 0;
    const settle = () => {
      if (!cancelled) setMedia({ status: "ready", working: results.filter((x): x is string => !!x) });
    };
    urls.forEach((u, i) => {
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      const finish = (ok: boolean) => {
        if (cancelled) return;
        results[i] = ok ? u : null;
        if (++done === urls.length) settle();
      };
      img.onload = () => finish(img.naturalWidth > 1);
      img.onerror = () => finish(false);
      img.src = u;
    });
    const t = setTimeout(settle, 6000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [app]);

  const scrollRef = useCallback((el: HTMLDivElement | null) => el?.scrollTo(0, 0), []);

  return (
    <main className="main">
      <div className="detail-header">
        <button className="btn" onClick={() => navigate(-1)}>
          <IconArrowLeft /> Back
        </button>
        <div className="topbar-spacer" />
        {app && <FavoriteToggle id={app.id} kind="app" size={18} />}
        {app?.websiteUrl && (
          <a className="btn" href={app.websiteUrl} target="_blank" rel="noreferrer">
            <IconExternal /> Store page
          </a>
        )}
        <button className="icon-btn" onClick={onToggleTheme} aria-label="Toggle theme">
          {theme === "dark" ? <IconSun /> : <IconMoon />}
        </button>
      </div>

      <div className="detail-scroll" ref={scrollRef}>
        {error ? (
          <div className="center-state">
            <IconInfo />
            <div className="title">Couldn’t load this app</div>
            <div className="sub">{error}</div>
            <Link className="btn" to="/">Back to database</Link>
          </div>
        ) : loading || !app ? (
          <DetailSkeleton />
        ) : (
          <div className="detail-inner">
            {/* hero */}
            <header className="hero">
              {app.iconUrl ? (
                <img className="hero-icon" src={app.iconUrl} alt="" referrerPolicy="no-referrer" />
              ) : (
                <div className="hero-icon app-icon placeholder">{app.title.charAt(0)}</div>
              )}
              <div className="hero-meta">
                <h1 className="hero-title">{app.title}</h1>
                <div className="hero-dev">{app.developer}</div>
                <div className="hero-tags">
                  <span className="pill pill-store" style={pillStyle(app.store === "apple" ? "#c8c8d0" : "#34d399")}>
                    {app.store === "apple" ? <IconApple /> : <IconGooglePlay />}
                    {app.store === "apple" ? "App Store" : "Google Play"}
                  </span>
                  {app.category && (
                    <span className="pill" style={pillStyle(categoryColor(app.category))}>
                      <span className="dot" /> {app.category}
                    </span>
                  )}
                  {app.contentRating && <span className="pill" style={pillStyle("#8a8a92")}>{app.contentRating}</span>}
                  {app.isFirstMover && <span className="fm-badge"><IconSpark /> First mover</span>}
                </div>
              </div>
            </header>

            {/* headline metrics — click to drive the chart */}
            <div className="metric-row">
              <MetricCard
                icon={<IconChart />}
                label="Downloads (30d)"
                value={formatCompact(app.downloadsEstimate30d)}
                delta={pctDelta(app.historicals, "downloadsEstimate")}
                active={chartMetric === "downloadsEstimate"}
                onClick={() => setChartMetric("downloadsEstimate")}
              />
              <MetricCard
                icon={<IconCoin />}
                label="MRR"
                value={formatMoney(app.revenueEstimate30d)}
                delta={pctDelta(app.historicals, "revenueEstimate")}
                active={chartMetric === "revenueEstimate"}
                onClick={() => setChartMetric("revenueEstimate")}
              />
              <MetricCard
                icon={<IconStar />}
                label="Rating"
                value={formatRating(app.rating)}
                sub={app.reviewCount ? `(${formatCompact(app.reviewCount)})` : undefined}
                delta={pctDelta(app.historicals, "rating")}
                active={chartMetric === "rating"}
                onClick={() => setChartMetric("rating")}
              />
              <MetricCard
                icon={<IconUsers />}
                label="Reviews"
                value={formatCompact(app.reviewCount)}
                delta={pctDelta(app.historicals, "reviewCount")}
                active={chartMetric === "reviewCount"}
                onClick={() => setChartMetric("reviewCount")}
              />
            </div>

            {/* trend chart */}
            <TrendPanel app={app} metric={chartMetric} />

            {/* quick facts — componentised, never loose text */}
            <DetailCard title="Details">
              <div className="facts-grid">
                <Fact label="Chart rank">
                  {(() => {
                    const r = app.historicals.length ? app.historicals[app.historicals.length - 1]!.chartRank : null;
                    return r != null ? `#${r}` : "—";
                  })()}
                </Fact>
                <Fact label="Category">{app.category ?? "—"}</Fact>
                <Fact label="Price">{app.price ? `$${app.price}` : "Free"}</Fact>
                <Fact label="Content rating">{app.contentRating ?? "—"}</Fact>
                <Fact label="Languages">{app.languages.length || "—"}</Fact>
                <Fact label="Released">{formatDate(app.releasedAt)}</Fact>
                <Fact label="Updated">{formatDate(app.updatedAt)}</Fact>
                <Fact label="Store ID">{app.storeAppId}</Fact>
              </div>
            </DetailCard>

            {/* listing media */}
            <DetailCard
              title="Listing media"
              action={
                media.status === "ready" && media.working.length >= MIN_COLLECTION ? (
                  <span className="dcard-count">{media.working.length} screenshots</span>
                ) : undefined
              }
            >
              {media.status === "probing" ? (
                <div className="media-grid">
                  {Array.from({ length: Math.min(6, app.screenshotUrls.length || 6) }).map((_, i) => (
                    <div key={i} className="skel" style={{ aspectRatio: "9 / 16", borderRadius: 15 }} />
                  ))}
                </div>
              ) : media.working.length >= MIN_COLLECTION ? (
                <div className="media-grid">
                  {media.working.map((s, i) => (
                    <button key={i} className="media-thumb" onClick={() => setLightbox(i)}>
                      <img src={s} alt={`${app.title} screenshot ${i + 1}`} referrerPolicy="no-referrer" loading="lazy" />
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyCard
                  icon={<IconImage />}
                  title="No screenshot collection"
                  sub="This app has no full set of working store screenshots. Preview videos aren’t collected yet."
                />
              )}
            </DetailCard>

            {/* about */}
            {app.description && (
              <DetailCard title="About">
                <p className="desc">{app.description}</p>
              </DetailCard>
            )}

            {/* contact & links */}
            <DetailCard title="Contact & links">
              <div className="links-row">
                <LinkRow icon={<IconUsers />} label="Developer" value={app.developer} />
                {app.websiteUrl ? (
                  <a className="link-row clickable" href={app.websiteUrl} target="_blank" rel="noreferrer">
                    <span className="lr-icon"><IconGlobe /></span>
                    <span className="lr-label">Website</span>
                    <span className="lr-value">{app.websiteUrl.replace(/^https?:\/\//, "")}</span>
                    <IconExternal />
                  </a>
                ) : (
                  <LinkRow icon={<IconGlobe />} label="Website" value="—" />
                )}
                <LinkRow icon={<IconMessage />} label="Support email" value={app.supportEmail ?? "Not collected"} />
              </div>
            </DetailCard>

            {/* in-app purchases */}
            {app.iaps.length > 0 && (
              <DetailCard title="In-app purchases" count={app.iaps.length}>
                <div className="iap-list">
                  {app.iaps.map((p, i) => (
                    <div key={i} className="iap-row">
                      <span>{p.name}</span>
                      <span className="price">{p.price != null ? `${p.currency ?? "$"}${p.price}` : "—"}</span>
                    </div>
                  ))}
                </div>
              </DetailCard>
            )}

            {/* reviews */}
            <DetailCard
              title="User reviews"
              action={reviews && reviews.length ? <span className="dcard-count">{reviews.length} · US</span> : undefined}
            >
              {reviews == null ? (
                <div className="review-list">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="skel" style={{ height: 70, borderRadius: 10 }} />
                  ))}
                </div>
              ) : reviews.length === 0 ? (
                <EmptyCard icon={<IconMessage />} title="No reviews collected" sub="No recent US reviews for this app yet." />
              ) : (
                <div className="review-list">
                  {[...reviews]
                    .sort((a, b) => +new Date(b.reviewedAt) - +new Date(a.reviewedAt))
                    .map((r) => (
                      <article key={r.id} className="review">
                        <div className="review-head">
                          <span className="review-stars" aria-label={`${r.rating} out of 5`}>
                            {Array.from({ length: 5 }).map((_, i) => (
                              <span key={i} className={i < r.rating ? "on" : "off"}>
                                <IconStar />
                              </span>
                            ))}
                          </span>
                          <span className="review-date">{formatDate(r.reviewedAt)}</span>
                        </div>
                        {r.title && <div className="review-title">{r.title}</div>}
                        <p className="review-body">{r.body}</p>
                        {r.author && <div className="review-author">{r.author}</div>}
                      </article>
                    ))}
                </div>
              )}
            </DetailCard>

            {/* similar apps */}
            <DetailCard title="Similar apps">
              <SimilarApps category={app.category} excludeId={app.id} />
            </DetailCard>

            {/* intelligence — data not ingested yet (honest empty-states) */}
            <div className="intel-grid">
              <DetailCard title="Meta ads" count={app.metaAds.length || undefined}>
                {app.metaAds.length === 0 ? (
                  <EmptyCard icon={<IconImage />} title="No Meta ads" sub="Ad-library ingestion pending." />
                ) : (
                  <div className="facts-grid">{app.metaAds.map((ad) => <Fact key={ad.id} label={ad.status ?? "Ad"}>{ad.adCopy ?? "—"}</Fact>)}</div>
                )}
              </DetailCard>
              <DetailCard title="Apple Search Ads" count={app.appleSearchAds.length || undefined}>
                {app.appleSearchAds.length === 0 ? (
                  <EmptyCard icon={<IconChart />} title="No Apple ads" sub="Apple Search Ads ingestion pending." />
                ) : (
                  <div className="facts-grid">{app.appleSearchAds.map((ad, i) => <Fact key={i} label={ad.keyword}>{ad.country}{ad.rank != null ? ` · #${ad.rank}` : ""}</Fact>)}</div>
                )}
              </DetailCard>
              <DetailCard title="Creators" count={app.creators.length || undefined}>
                {app.creators.length === 0 ? (
                  <EmptyCard icon={<IconUsers />} title="No creators" sub="Creator-partnership ingestion pending." />
                ) : (
                  <div className="facts-grid">{app.creators.map((c, i) => <Fact key={i} label={c.platform}>{c.handle}</Fact>)}</div>
                )}
              </DetailCard>
            </div>

            {app.historicals.length < 2 && (
              <div className="notice">
                <IconInfo />
                <span>Trend charts and deltas fill in as daily snapshots accumulate — only one snapshot exists so far.</span>
              </div>
            )}
          </div>
        )}
      </div>

      {app && lightbox !== null && media.working.length > 0 && (
        <Lightbox
          images={media.working}
          index={lightbox}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
          title={app.title}
        />
      )}
    </main>
  );
}

function LinkRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="link-row">
      <span className="lr-icon">{icon}</span>
      <span className="lr-label">{label}</span>
      <span className="lr-value">{value}</span>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="detail-inner">
      <div className="hero">
        <div className="skel" style={{ width: 88, height: 88, borderRadius: 20 }} />
        <div style={{ flex: 1 }}>
          <div className="skel" style={{ width: "40%", height: 26, marginBottom: 10 }} />
          <div className="skel" style={{ width: "25%", height: 13, marginBottom: 14 }} />
          <div className="skel" style={{ width: "55%", height: 22 }} />
        </div>
      </div>
      <div className="metric-row">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skel" style={{ height: 92, borderRadius: 14 }} />)}
      </div>
      <div className="skel" style={{ height: 200, borderRadius: 14 }} />
    </div>
  );
}
