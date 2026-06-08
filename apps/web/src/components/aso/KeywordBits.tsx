// Lane B — reusable keyword presentation bits (meters, badges, detail panel, list card).
import type { ReactNode } from "react";
import type { Store } from "@kittie/types";
import { IconApple, IconGooglePlay, IconRank, IconSpark, IconStar, IconUsers } from "../../icons";
import { computeInsights, type KeywordDifficulty } from "../../lib/api/keywords";
import { formatCompact } from "../../lib/format";

export function StorePill({ store }: { store: Store }) {
  return (
    <span className="store-pill">
      {store === "apple" ? <IconApple /> : <IconGooglePlay />}
      {store === "apple" ? "App Store" : "Google Play"}
    </span>
  );
}

export function OpportunityBadge({ score, large }: { score: number; large?: boolean }) {
  // Spec v1 tops out ≈70; treat ≥45 as a hot lead.
  const hot = score >= 45;
  return (
    <span className={`opp-badge ${hot ? "hot" : ""} ${large ? "lg" : ""}`} title="Opportunity score = (popularity×0.4) + ((100−difficulty)×0.3)">
      <span className="num">{score}</span>
      <span className="lbl">opp</span>
    </span>
  );
}

type MeterKind = "popularity" | "difficulty" | "traffic";

function meterColor(kind: MeterKind, value: number): string {
  if (kind === "difficulty") {
    // lower is better
    if (value <= 30) return "var(--positive)";
    if (value <= 60) return "#f5c451";
    return "var(--danger)";
  }
  return "var(--accent)";
}

export function Meter({
  kind,
  label,
  value,
  max = 100,
}: {
  kind: MeterKind;
  label: string;
  value: number;
  max?: number;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="meter">
      <div className="meter-head">
        <span className="meter-label">{label}</span>
        <span className="meter-val">{value}</span>
      </div>
      <div className="meter-track">
        <span className="meter-fill" style={{ width: `${pct}%`, background: meterColor(kind, value) }} />
      </div>
    </div>
  );
}

export function AppAvatar({ title, iconUrl }: { title: string; iconUrl: string | null }) {
  if (!iconUrl) {
    return <div className="app-icon placeholder">{title.slice(0, 1).toUpperCase()}</div>;
  }
  return <img className="app-icon" src={iconUrl} alt="" loading="lazy" />;
}

/** List card for a single looked-up keyword (Keyword Explorer left rail). */
export function KeywordCard({
  kd,
  active,
  onSelect,
}: {
  kd: KeywordDifficulty;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button className={`kw-card ${active ? "active" : ""}`} onClick={onSelect}>
      <div className="kw-card-top">
        <span className="kw-name">{kd.keyword}</span>
        <OpportunityBadge score={kd.opportunityScore} />
      </div>
      <div className="kw-card-meters">
        <Meter kind="popularity" label="Popularity" value={kd.popularity} />
        <Meter kind="difficulty" label="Difficulty" value={kd.difficulty} />
      </div>
    </button>
  );
}

/** Pending placeholder card while a lookup is in flight. */
export function PendingCard({ keyword }: { keyword: string }) {
  return (
    <div className="kw-card pending">
      <div className="kw-card-top">
        <span className="kw-name">{keyword}</span>
        <span className="aso-spin" />
      </div>
      <div className="kw-card-meters">
        <div className="skel" style={{ height: 26, flex: 1 }} />
        <div className="skel" style={{ height: 26, flex: 1 }} />
      </div>
    </div>
  );
}

/** Full keyword detail — insights + metrics + top ranking apps. Shared by both pages.
 *  Optional `children` render inside the same scroll container (e.g. the related-ideas table). */
export function KeywordDetail({ kd, children }: { kd: KeywordDifficulty; children?: ReactNode }) {
  const insights = computeInsights(kd);
  return (
    <div className="aso-detail-inner">
      <div className="kw-detail-head">
        <div>
          <h1 className="kw-detail-title">{kd.keyword}</h1>
          <div className="kw-detail-sub">
            {kd.competingAppCount.toLocaleString()} competing apps · live store search
          </div>
        </div>
        <div className="spacer" />
        <StorePill store={kd.store} />
        <span className="flag" title="United States">🇺🇸</span>
        <OpportunityBadge score={kd.opportunityScore} large />
      </div>

      <div className="aso-metrics">
        <div className="aso-metric">
          <div className="m-top"><span className="m-label">Popularity</span></div>
          <div className="m-value">{kd.popularity}<span className="unit"> /100</span></div>
          <Meter kind="popularity" label="Search volume" value={kd.popularity} />
        </div>
        <div className="aso-metric">
          <div className="m-top"><span className="m-label">Difficulty</span></div>
          <div className="m-value">{kd.difficulty}<span className="unit"> /100</span></div>
          <Meter kind="difficulty" label="Rank effort" value={kd.difficulty} />
        </div>
        <div className="aso-metric">
          <div className="m-top"><span className="m-label">Traffic</span></div>
          <div className="m-value">{kd.trafficScore}<span className="unit"> /100</span></div>
          <Meter kind="traffic" label="If you rank" value={kd.trafficScore} />
        </div>
        <div className="aso-metric">
          <div className="m-top"><span className="m-label">Competing apps</span></div>
          <div className="m-value">{kd.competingAppCount}</div>
          <div className="meter-label" style={{ marginTop: 12 }}>ranked for this term</div>
        </div>
      </div>

      <div className="section-label">Keyword insights</div>
      {insights.length === 0 ? (
        <div className="aso-empty">
          <IconSpark />
          <div className="t">No ranking apps returned</div>
          <div className="s">Insights need at least one ranked app. Try a broader term.</div>
        </div>
      ) : (
        <div className="insight-grid">
          {insights.map((ins) => (
            <div key={ins.label} className={`insight ${ins.tone}`}>
              <div className="insight-label"><span className="dot" />{ins.label}</div>
              <div className="insight-value">{ins.value}</div>
              <div className="insight-hint">{ins.hint}</div>
            </div>
          ))}
        </div>
      )}

      <div className="section-head" style={{ margin: "30px 0 4px" }}>
        <div className="section-label" style={{ margin: 0 }}>Top ranking apps</div>
        <span className="section-count">{kd.topApps.length} shown</span>
      </div>
      {kd.topApps.length === 0 ? (
        <div className="aso-empty">
          <IconRank />
          <div className="t">No apps ranking yet</div>
          <div className="s">Nothing surfaced for this term in the {kd.store === "apple" ? "App Store" : "Google Play"}.</div>
        </div>
      ) : (
        <div className="rank-list">
          {kd.topApps.slice(0, 10).map((app) => (
            <div key={`${app.rank}-${app.title}`} className={`rank-row ${app.rank <= 3 ? "top" : ""}`}>
              <span className="rank-num">{app.rank}</span>
              <AppAvatar title={app.title} iconUrl={app.iconUrl} />
              <div className="rank-meta">
                <div className="rank-title">{app.title}</div>
                <div className="rank-sub">
                  <IconUsers style={{ width: 11, height: 11, verticalAlign: -1, marginRight: 3 }} />
                  {formatCompact(app.reviewCount)} reviews
                </div>
              </div>
              <span className="rating">
                <IconStar />
                {app.rating != null ? app.rating.toFixed(1) : "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      {children}
    </div>
  );
}
