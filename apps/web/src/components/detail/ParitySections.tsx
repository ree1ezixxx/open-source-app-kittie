/* ============================================================
   Lane D — App-Detail parity sections.
   Meta ads · Apple Search Ads · Creators · In-app purchases.

   Every back table is 0 rows today (Meta blocked, ASA/creators/iaps
   uncollected) → each section renders an HONEST empty-state, matching
   the tone of the page's existing "Preview videos aren't collected yet".
   When the tables fill, the populated branches render real rows.
   ============================================================ */
import type { AppDetail } from "@kittie/types";
import { formatCompact } from "../../lib/format";
import { IconRank, IconUsers, IconCoin, IconImage, IconSearch } from "../../icons";
import "../../styles/reviews.css";

function ParityEmpty({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="media-empty">
      {icon}
      <div className="t">{title}</div>
      <div className="s">{sub}</div>
    </div>
  );
}

function SectionHead({ label, count }: { label: string; count?: number }) {
  return (
    <div className="section-head">
      <div className="section-label" style={{ margin: 0 }}>{label}</div>
      {count != null && count > 0 && <span className="section-count">{count}</span>}
    </div>
  );
}

export function DetailParitySections({ app }: { app: AppDetail }) {
  return (
    <div className="parity">
      {/* ---- Meta ads ---- */}
      <section>
        <SectionHead label="Meta ads" count={app.metaAds.length} />
        {app.metaAds.length === 0 ? (
          <ParityEmpty
            icon={<IconImage />}
            title="No Meta ad creatives"
            sub="Meta’s ad library is blocked for automated collection, so no creatives are stored for this app yet."
          />
        ) : (
          <div className="parity-ad-grid">
            {app.metaAds.map((ad) => (
              <div className="parity-ad" key={ad.id}>
                {ad.imageUrl ? (
                  <img className="parity-ad-img" src={ad.imageUrl} alt="" referrerPolicy="no-referrer" loading="lazy" />
                ) : (
                  <div className="parity-ad-img placeholder"><IconImage /></div>
                )}
                <div className="parity-ad-body">
                  {ad.adCopy && <p className="parity-ad-copy">{ad.adCopy}</p>}
                  <div className="parity-ad-meta">
                    {ad.status && <span className="parity-chip">{ad.status}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---- Apple Search Ads ---- */}
      <section>
        <SectionHead label="Apple Search Ads" count={app.appleSearchAds.length} />
        {app.appleSearchAds.length === 0 ? (
          <ParityEmpty
            icon={<IconSearch />}
            title="No Apple Search Ads data"
            sub="Keyword ad-rank signals aren’t collected for this app yet."
          />
        ) : (
          <div className="parity-asa">
            {app.appleSearchAds.map((a, i) => (
              <div className="parity-asa-row" key={i}>
                <span className="parity-asa-kw">{a.keyword}</span>
                <span className="parity-asa-country">{a.country}</span>
                <span className="parity-asa-rank">{a.rank != null ? `#${a.rank}` : "—"}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---- Creators ---- */}
      <section>
        <SectionHead label="Creator partnerships" count={app.creators.length} />
        {app.creators.length === 0 ? (
          <ParityEmpty
            icon={<IconUsers />}
            title="No creator partnerships"
            sub="Influencer and UGC links aren’t collected for this app yet."
          />
        ) : (
          <div className="parity-creators">
            {app.creators.map((c, i) => (
              <a className="parity-creator" key={i} href={c.profileUrl ?? "#"} target="_blank" rel="noreferrer">
                <div className="parity-creator-platform">{c.platform}</div>
                <div className="parity-creator-handle">@{c.handle}</div>
                {c.followerCount != null && (
                  <div className="parity-creator-followers">{formatCompact(c.followerCount)} followers</div>
                )}
              </a>
            ))}
          </div>
        )}
      </section>

      {/* ---- In-app purchases ---- */}
      <section>
        <SectionHead label="In-app purchases" count={app.iaps.length} />
        {app.iaps.length === 0 ? (
          <ParityEmpty
            icon={<IconCoin />}
            title="No in-app purchases listed"
            sub="None were found in this app’s store metadata."
          />
        ) : (
          <div className="parity-iaps">
            {app.iaps.map((p, i) => (
              <div key={i} className="iap-row">
                <span>{p.name}</span>
                <span className="price">{p.price != null ? `${p.currency ?? "$"}${p.price}` : "—"}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
