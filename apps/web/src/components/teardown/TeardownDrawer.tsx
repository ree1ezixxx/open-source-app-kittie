import { useNavigate } from "react-router-dom";
import type { AppDetail, Review } from "@kittie/types";
import { DetailCard, EmptyCard, Fact } from "../DetailCard";
import { SimilarApps } from "../SimilarApps";
import { formatCompact, formatMoney, formatRating, formatDate } from "../../lib/format";
import { IconImage, IconChart, IconMessage, IconStar } from "../../icons";

const TITLES: Record<string, string> = {
  app: "Overview",
  growth: "Growth",
  ads: "Acquisition",
  discovery: "Discovery & ASO",
  stack: "Stack",
  voice: "Voice",
  competitors: "Competitors",
};

function chartRank(app: AppDetail): string {
  const r = app.historicals.length ? app.historicals[app.historicals.length - 1]!.chartRank : null;
  return r != null ? `#${r}` : "—";
}

export function TeardownDrawer({
  app,
  reviews,
  kind,
  onClose,
}: {
  app: AppDetail;
  reviews: Review[] | null;
  kind: string | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const reRoot = (id: string) => navigate(`/apps/${encodeURIComponent(id)}`);
  return (
    <>
      <div className={`td-drawer-scrim ${kind ? "open" : ""}`} onClick={onClose} />
      <aside className={`td-drawer ${kind ? "open" : ""}`} aria-hidden={!kind}>
        {kind && (
          <>
            <header className="td-drawer-head">
              <span className="td-drawer-title">{TITLES[kind] ?? kind}</span>
              <button className="td-drawer-close" onClick={onClose} aria-label="Close drawer">
                ✕
              </button>
            </header>
            <div className="td-drawer-body">{renderBody(kind, app, reviews, reRoot)}</div>
          </>
        )}
      </aside>
    </>
  );
}

function renderBody(kind: string, app: AppDetail, reviews: Review[] | null, reRoot: (id: string) => void) {
  switch (kind) {
    case "growth":
      return (
        <DetailCard title="Growth signals">
          <div className="facts-grid">
            <Fact label="Downloads 30D">{formatCompact(app.downloadsEstimate30d)}</Fact>
            <Fact label="MRR (est)">{formatMoney(app.revenueEstimate30d)}</Fact>
            <Fact label="Growth score">{app.growthScore != null ? Math.round(app.growthScore) : "—"}</Fact>
            <Fact label="Chart rank">{chartRank(app)}</Fact>
            <Fact label="First mover">{app.isFirstMover ? "Yes" : "No"}</Fact>
          </div>
        </DetailCard>
      );
    case "ads":
      return (
        <>
          <DetailCard title="Meta ads" count={app.metaAds.length || undefined}>
            {app.metaAds.length === 0 ? (
              <EmptyCard icon={<IconImage />} title="No Meta ads" sub="Ad-library ingestion pending." />
            ) : (
              <div className="facts-grid">
                {app.metaAds.map((a) => (
                  <Fact key={a.id} label={a.status ?? "Ad"}>
                    {a.adCopy ?? "—"}
                  </Fact>
                ))}
              </div>
            )}
          </DetailCard>
          <DetailCard title="Apple Search Ads" count={app.appleSearchAds.length || undefined}>
            {app.appleSearchAds.length === 0 ? (
              <EmptyCard icon={<IconChart />} title="No Apple ads" sub="Apple Search Ads ingestion pending." />
            ) : (
              <div className="facts-grid">
                {app.appleSearchAds.map((a, i) => (
                  <Fact key={i} label={a.keyword}>
                    {a.country}
                    {a.rank != null ? ` · #${a.rank}` : ""}
                  </Fact>
                ))}
              </div>
            )}
          </DetailCard>
        </>
      );
    case "discovery":
      return (
        <DetailCard title="Discovery & ASO">
          <div className="facts-grid">
            <Fact label="Languages">{app.languages.length || "—"}</Fact>
            <Fact label="Chart rank">{chartRank(app)}</Fact>
            <Fact label="Category">{app.category ?? "—"}</Fact>
            <Fact label="Content rating">{app.contentRating ?? "—"}</Fact>
          </div>
        </DetailCard>
      );
    case "stack":
      return (
        <DetailCard title="Build & monetization">
          <div className="facts-grid">
            <Fact label="Size">{app.fileSizeBytes ? `${Math.round(app.fileSizeBytes / 1_048_576)} MB` : "—"}</Fact>
            <Fact label="Min OS">
              {app.minOsVersion ? `${app.store === "apple" ? "iOS" : "Android"} ${app.minOsVersion}+` : "—"}
            </Fact>
            <Fact label="Price">{app.price ? `$${app.price}` : "Free"}</Fact>
            <Fact label="In-app purchases">{app.iaps.length || "None"}</Fact>
            <Fact label="Provider">{app.sellerName ?? app.developer}</Fact>
          </div>
        </DetailCard>
      );
    case "voice":
      return (
        <>
          <DetailCard title="Sentiment">
            <div className="facts-grid">
              <Fact label="Rating">{formatRating(app.rating)}</Fact>
              <Fact label="Reviews">{formatCompact(app.reviewCount)}</Fact>
              <Fact label="Creators">{app.creators.length || "None"}</Fact>
            </div>
          </DetailCard>
          <DetailCard title="Recent reviews" count={reviews?.length || undefined}>
            {!reviews?.length ? (
              <EmptyCard icon={<IconMessage />} title="No reviews collected" sub="No recent US reviews yet." />
            ) : (
              <div className="review-list">
                {[...reviews]
                  .sort((a, b) => +new Date(b.reviewedAt) - +new Date(a.reviewedAt))
                  .slice(0, 5)
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
                    </article>
                  ))}
              </div>
            )}
          </DetailCard>
        </>
      );
    case "competitors":
      return (
        <DetailCard title="Similar apps">
          <p className="td-drawer-hint">Click a competitor to re-root the canvas on it.</p>
          <SimilarApps category={app.category} excludeId={app.id} onPick={reRoot} />
        </DetailCard>
      );
    case "app":
    default:
      return (
        <DetailCard title="Overview">
          <div className="facts-grid">
            <Fact label="Developer">{app.developer}</Fact>
            <Fact label="Category">{app.category ?? "—"}</Fact>
            <Fact label="Store">{app.store === "apple" ? "App Store" : "Google Play"}</Fact>
            <Fact label="Released">{formatDate(app.releasedAt)}</Fact>
            <Fact label="Updated">{formatDate(app.updatedAt)}</Fact>
          </div>
        </DetailCard>
      );
  }
}
