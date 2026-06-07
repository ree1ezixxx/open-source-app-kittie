import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { AppDetail } from "@kittie/types";
import { getApp } from "../lib/api";
import type { Theme } from "../lib/theme";
import { categoryColor, pillStyle } from "../lib/palette";
import { formatCompact, formatMoney, formatRating, formatDate } from "../lib/format";
import { HistoryChart } from "../components/Chart";
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
  IconTrending,
  IconRank,
  IconSun,
  IconMoon,
  IconExternal,
  IconImage,
} from "../icons";
import { Lightbox } from "../components/Lightbox";
import { DetailParitySections } from "../components/detail/ParitySections";

// A gallery must be a real collection of *working* images, not a lone/broken shot.
const MIN_COLLECTION = 3;

function Stat({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="stat">
      <div className="label">{icon}{label}</div>
      <div className="value">{children}</div>
    </div>
  );
}

export function AppDetailPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [app, setApp] = useState<AppDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
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
    getApp(decodeURIComponent(id), ac.signal)
      .then((d) => !ac.signal.aborted && setApp(d))
      .catch((e) => !ac.signal.aborted && setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => !ac.signal.aborted && setLoading(false));
    return () => ac.abort();
  }, [id]);

  // Probe each screenshot in-browser (with no-referrer, matching how we render) and keep
  // only the ones that actually load. A gallery shows only if it's a real working collection.
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

  // scroll the detail body to top on app change
  const scrollRef = useCallback((el: HTMLDivElement | null) => el?.scrollTo(0, 0), []);

  return (
    <main className="main">
      <div className="detail-header">
        <button className="btn" onClick={() => navigate(-1)}>
          <IconArrowLeft /> Back
        </button>
        <div className="topbar-spacer" />
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

            {/* metrics */}
            <div className="stat-grid stat-grid-6">
              <Stat icon={<IconRank />} label="Chart rank">
                {(() => {
                  const r = app.historicals.length ? app.historicals[app.historicals.length - 1]!.chartRank : null;
                  return r != null ? <>#{r}</> : "—";
                })()}
              </Stat>
              <Stat icon={<IconStar />} label="Rating">{formatRating(app.rating)}</Stat>
              <Stat icon={<IconUsers />} label="Reviews">{formatCompact(app.reviewCount)}</Stat>
              <Stat icon={<IconChart />} label="Downloads 30d">{formatCompact(app.downloadsEstimate30d)}</Stat>
              <Stat icon={<IconCoin />} label="Revenue 30d">{formatMoney(app.revenueEstimate30d)}</Stat>
              <Stat icon={<IconTrending />} label="Growth">{app.growthScore != null ? app.growthScore.toFixed(1) : "—"}</Stat>
            </div>

            {/* Listing media — first-class; only a working collection is shown */}
            <section>
              <div className="section-head">
                <div className="section-label" style={{ margin: 0 }}>Listing media</div>
                {media.status === "ready" && media.working.length >= MIN_COLLECTION && (
                  <span className="section-count">{media.working.length} screenshots</span>
                )}
              </div>
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
                <div className="media-empty">
                  <IconImage />
                  <div className="t">No screenshot collection</div>
                  <div className="s">
                    This app doesn’t have a full set of working store screenshots
                    {app.screenshotUrls.length > 0 ? " — only a stray or broken image, so none are shown." : "."}
                    {" "}Preview videos aren’t collected yet.
                  </div>
                </div>
              )}
            </section>

            {/* trends */}
            <div className="trend-grid">
              <div>
                <div className="section-label">Revenue trend</div>
                <HistoryChart points={app.historicals} metric="revenueEstimate" label="Est. monthly revenue" />
              </div>
              <div>
                <div className="section-label">Reviews trend</div>
                <HistoryChart points={app.historicals} metric="reviewCount" label="Total reviews" />
              </div>
            </div>

            {/* about + details two-column */}
            <div className="detail-cols">
              <div>
                {app.description && (
                  <>
                    <div className="section-label">About</div>
                    <p className="desc">{app.description}</p>
                  </>
                )}
              </div>
              <div>
                <div className="section-label">Details</div>
                <dl className="kv">
                  <dt>Developer</dt><dd>{app.developer}</dd>
                  <dt>Category</dt><dd>{app.category ?? "—"}</dd>
                  <dt>Content rating</dt><dd>{app.contentRating ?? "—"}</dd>
                  <dt>Price</dt><dd>{app.price ? `$${app.price}` : "Free"}</dd>
                  <dt>Released</dt><dd>{formatDate(app.releasedAt)}</dd>
                  <dt>Updated</dt><dd>{formatDate(app.updatedAt)}</dd>
                </dl>
                {app.languages.length > 0 && (
                  <>
                    <div className="section-label">Languages ({app.languages.length})</div>
                    <div className="lang-chips">
                      {app.languages.slice(0, 30).map((l) => <span key={l} className="lang-chip">{l}</span>)}
                      {app.languages.length > 30 && <span className="lang-chip">+{app.languages.length - 30}</span>}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Lane D — acquisition & monetization parity (honest empty-states today) */}
            <DetailParitySections app={app} />

            {app.historicals.length < 2 && (
              <div className="notice">
                <IconInfo />
                <span>Trend charts and growth score fill in as daily snapshots accumulate — only one snapshot exists so far.</span>
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
      <div className="stat-grid stat-grid-6">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skel" style={{ height: 74, borderRadius: 11 }} />)}
      </div>
      <div className="media-grid">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skel" style={{ aspectRatio: "9/19", borderRadius: 14 }} />)}
      </div>
    </div>
  );
}
