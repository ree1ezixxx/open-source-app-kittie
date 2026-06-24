import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import "../styles/aistudio.css";
import {
  fetchIdeaDetail,
  ideaHref,
  blueprintLabel,
  type IdeaDetail,
} from "../lib/api/ideas";
import { appHref } from "../lib/slug";
import { IdeaMockup } from "../components/aistudio/IdeaMockup";
import { FavoriteToggle } from "../components/FavoriteToggle";
import { StudioEmptyState } from "../components/aistudio/StudioEmptyState";
import { IconStar } from "../icons";
import { IconBulb } from "../components/aistudio/icons";
import { compact } from "../components/aistudio/util";

type Tab = "building" | "opportunity" | "marketing";

const TABS: { id: Tab; label: string }[] = [
  { id: "building", label: "Building" },
  { id: "opportunity", label: "Opportunity" },
  { id: "marketing", label: "Marketing" },
];

/** Build the export-as-prompt text from the stored Blueprint — ready for Claude Code. */
function buildPrompt(detail: IdeaDetail): string {
  const { idea } = detail;
  const bp = idea.blueprintDoc;
  const lines = [
    `Build this app: ${idea.title}`,
    "",
    idea.description,
    "",
    `Category: ${idea.ideaCategory} (derived from a ${idea.sourceCategory} app)`,
  ];
  if (bp) {
    lines.push(
      "",
      `Difficulty: ${bp.difficulty} — ${bp.difficultyReasoning}`,
      `Timeline: ~${bp.timelineWeeks} weeks`,
      "",
      "Requirements:",
      ...bp.requirements.map((r) => `- ${r}`),
      "",
      "MVP features:",
      ...bp.mvpFeatures.map((f) => `- ${f}`),
      "",
      "Key features:",
      ...bp.keyFeatures.map((f) => `- ${f}`),
      "",
      "V2 features (later):",
      ...bp.v2Features.map((f) => `- ${f}`),
      "",
      `Architecture: ${bp.architecture}`,
      `Tech stack: ${bp.techStack.join(", ")}`,
      `MVP scope: ${bp.mvpScope}`,
      `Third-party services: ${bp.thirdPartyServices.join(", ") || "none"}`,
    );
  }
  return lines.join("\n");
}

export function IdeaDetailPage() {
  const { slug = "" } = useParams();
  const storeAppId = useMemo(() => /-id([^/]+)$/.exec(decodeURIComponent(slug))?.[1] ?? null, [slug]);

  const [detail, setDetail] = useState<IdeaDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [tab, setTab] = useState<Tab>("building");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!storeAppId) {
      setState("missing");
      return;
    }
    let alive = true;
    setState("loading");
    fetchIdeaDetail(storeAppId)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        setState(d ? "ready" : "missing");
      })
      .catch(() => alive && setState("missing"));
    return () => {
      alive = false;
    };
  }, [storeAppId]);

  useEffect(() => {
    if (detail) document.title = `${detail.idea.title} — Hot idea · Kittie`;
    return () => {
      document.title = "Kittie";
    };
  }, [detail]);

  if (state === "loading") {
    return (
      <main className="main">
        <div className="idea-detail">
          <div className="skel" style={{ height: 28, width: "40%" }} />
          <div className="skel" style={{ height: 220, width: "100%", marginTop: 16 }} />
        </div>
      </main>
    );
  }

  if (state === "missing" || !detail) {
    return (
      <main className="main">
        <StudioEmptyState
          icon={<IconBulb />}
          title="Idea not found"
          sub="It may not be generated yet — the ideas pipeline fills in over time."
        />
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <Link className="btn" to="/dashboard/hot-ideas">
            Back to Hot ideas
          </Link>
        </div>
      </main>
    );
  }

  const { idea, sourceApp, similar, inAppPurchases } = detail;
  const bp = idea.blueprintDoc;
  const storeUrl =
    sourceApp.store === "apple"
      ? `https://apps.apple.com/app/id${sourceApp.storeAppId}`
      : `https://play.google.com/store/apps/details?id=${sourceApp.storeAppId}`;

  const onExport = () => {
    void navigator.clipboard.writeText(buildPrompt(detail)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <main className="main">
      <div className="idea-detail">
        {/* breadcrumb */}
        <nav className="breadcrumb">
          <Link to="/dashboard/explore">Home</Link>
          <span>/</span>
          <Link to="/dashboard/hot-ideas">Hot ideas</Link>
          <span>/</span>
          <span className="current">{idea.title}</span>
        </nav>

        {/* hero */}
        <header className="idea-detail-hero">
          <div className="idea-detail-mock">
            <IdeaMockup idea={idea} height={280} />
          </div>
          <div className="idea-detail-head">
            <h1 data-field="name">{idea.title}</h1>
            <p className="idea-detail-summary" data-field="description">{idea.description}</p>
            <div className="idea-meta">
              <span className="idea-cat" data-field="source-category">{idea.sourceCategory}</span>
              <span>·</span>
              <span data-field="idea-category">{idea.ideaCategory}</span>
              <span>·</span>
              <span className="idea-rating" data-field="rating" data-value={idea.rating}>
                <IconStar /> {idea.rating.toFixed(1)}
              </span>
            </div>
            <div className="idea-blueprint" data-field="blueprint">
              {idea.blueprint.map((tag) => (
                <span key={tag} className={`bp-tag bp-${tag}`} data-value={tag}>
                  <span className="dot" />
                  {blueprintLabel(tag)}
                </span>
              ))}
            </div>
            <div className="idea-detail-actions" data-field="actions">
              <button className="btn btn-accent" onClick={onExport}>
                {copied ? "Copied ✓" : "Export as prompt"}
              </button>
              <FavoriteToggle
                type="hotIdea"
                id={idea.id}
                snapshot={{
                  title: idea.title,
                  subtitle: `${idea.ideaCategory} · ${idea.sourceCategory}`,
                  href: ideaHref(idea),
                }}
              />
              <a className="btn" href={storeUrl} target="_blank" rel="noreferrer">
                App Store
              </a>
              <Link className="btn" to={appHref({ id: `${sourceApp.store}:${sourceApp.storeAppId}`, title: sourceApp.title })}>
                Source app profile
              </Link>
            </div>
          </div>
        </header>

        {/* tabs */}
        <div className="idea-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`idea-tab${tab === t.id ? " on" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "building" && bp && (
          <section className="idea-panel" data-section="building">
            <div className="idea-panel-grid">
              <div className="idea-fact">
                <span className="k">Difficulty</span>
                <span className={`v diff-${bp.difficulty}`} data-field="difficulty" data-value={bp.difficulty}>{bp.difficulty}</span>
                <p data-field="difficulty-reasoning">{bp.difficultyReasoning}</p>
              </div>
              <div className="idea-fact">
                <span className="k">Timeline</span>
                <span className="v" data-field="timeline-weeks" data-value={bp.timelineWeeks}>~{bp.timelineWeeks} weeks</span>
                <p data-field="mvp-scope">{bp.mvpScope}</p>
              </div>
              <div className="idea-fact">
                <span className="k">Architecture</span>
                <span className="v" data-field="architecture">{bp.architecture}</span>
                <p data-field="tech-stack">{bp.techStack.join(" · ")}</p>
              </div>
            </div>

            <div className="idea-features">
              <div className="idea-feature-col">
                <h3>MVP features</h3>
                <ul data-field="mvp-features">{bp.mvpFeatures.map((f, i) => <li key={i}>{f}</li>)}</ul>
              </div>
              <div className="idea-feature-col">
                <h3>Key features</h3>
                <ul data-field="key-features">{bp.keyFeatures.map((f, i) => <li key={i}>{f}</li>)}</ul>
              </div>
              <div className="idea-feature-col">
                <h3>V2 features</h3>
                <ul data-field="v2-features">{bp.v2Features.map((f, i) => <li key={i}>{f}</li>)}</ul>
              </div>
            </div>

            <div className="idea-reqs">
              <h3>Requirements</h3>
              <ul data-field="requirements">{bp.requirements.map((r, i) => <li key={i}>{r}</li>)}</ul>
              {bp.thirdPartyServices.length > 0 && (
                <>
                  <h3>Third-party services</h3>
                  <ul data-field="third-party-services">{bp.thirdPartyServices.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </>
              )}
            </div>
          </section>
        )}

        {tab === "opportunity" && (
          <section className="idea-panel" data-section="opportunity">
            {bp?.opportunity ? (
              <>
                <p className="idea-opportunity-note" style={{ marginTop: 0, fontSize: 15 }} data-field="opportunity-thesis">
                  {bp.opportunity.summary}
                </p>
                <div className="idea-panel-grid">
                  <div className="idea-fact"><span className="k">Why this app</span><p data-field="why-this-app">{bp.opportunity.whyThisApp}</p></div>
                  <div className="idea-fact"><span className="k">Market size</span><p data-field="market-size">{bp.opportunity.marketSizeInsight}</p></div>
                  <div className="idea-fact"><span className="k">Target audience</span><p data-field="target-audience">{bp.opportunity.targetAudience}</p></div>
                  <div className="idea-fact"><span className="k">Monetization</span><p data-field="monetization">{bp.opportunity.monetizationStrategy}</p></div>
                </div>
                <div className="idea-features">
                  <div className="idea-feature-col">
                    <h3>Pain points</h3>
                    <ul data-field="pain-points">{bp.opportunity.painPoints.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </div>
                  <div className="idea-feature-col">
                    <h3>Feature gaps</h3>
                    <ul data-field="feature-gaps">{bp.opportunity.featureGaps.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </div>
                  <div className="idea-feature-col">
                    <h3>Competitive edge</h3>
                    <ul data-field="competitive-advantages">{bp.opportunity.competitiveAdvantages.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </div>
                </div>
                <p className="idea-opportunity-note">AI-generated analysis — directional, not a guarantee.</p>
              </>
            ) : (
              <p className="idea-opportunity-note" style={{ marginTop: 0 }}>
                Opportunity analysis is being generated for this idea — check back soon.
              </p>
            )}
            <h3>Source app</h3>
            <div className="idea-source-card" data-section="source-app" data-store={sourceApp.store}>
              {sourceApp.iconUrl && <img src={sourceApp.iconUrl} alt="" className="idea-source-icon" />}
              <div className="idea-source-info">
                <strong data-field="source-app-name">{sourceApp.title}</strong>
                <span className="muted">
                  <span data-field="developer">{sourceApp.developer ?? "Unknown developer"}</span> · <span data-field="category">{sourceApp.category ?? "—"}</span>
                </span>
              </div>
              <div className="idea-source-stats">
                <div><span className="k">Reviews</span><span className="v" data-field="reviews" data-value={sourceApp.reviews}>{compact(sourceApp.reviews)}</span></div>
                <div><span className="k">Rating</span><span className="v" data-field="rating" data-value={sourceApp.rating ?? undefined}>{sourceApp.rating?.toFixed(1) ?? "—"}</span></div>
                <div><span className="k">Downloads est.</span><span className="v" data-field="downloads" data-value={sourceApp.downloads ?? undefined}>{sourceApp.downloads ? compact(sourceApp.downloads) : "—"}</span></div>
                <div><span className="k">Revenue est.</span><span className="v" data-field="revenue" data-value={sourceApp.revenue ?? undefined}>{sourceApp.revenue ? `$${compact(sourceApp.revenue)}/mo` : "—"}</span></div>
                <div><span className="k">Price</span><span className="v" data-field="price" data-value={sourceApp.price ?? undefined}>{sourceApp.price ? `$${sourceApp.price}` : "Free"}</span></div>
              </div>
            </div>
            {inAppPurchases.length > 0 && (
              <div className="idea-reqs">
                <h3>In-app purchases</h3>
                <ul data-field="in-app-purchases">
                  {inAppPurchases.map((p, i) => (
                    <li key={i}>
                      {p.name}
                      {p.price != null ? (p.currency ? ` — ${p.price} ${p.currency}` : ` — $${p.price}`) : ""}
                    </li>
                  ))}
                </ul>
                <p className="muted" style={{ fontSize: 12 }}>How the proven incumbent monetizes.</p>
              </div>
            )}
            <p className="idea-opportunity-note">
              This concept is derived from a real, fast-growing {idea.sourceCategory} app. The
              metrics above are Observed and Estimated signals for the source app — proven demand
              the idea builds on, not projections for the idea itself.
            </p>
          </section>
        )}

        {tab === "marketing" && (
          <section className="idea-panel" data-section="marketing">
            {bp?.marketing ? (
              <>
                <p className="idea-opportunity-note" style={{ marginTop: 0, fontSize: 15 }} data-field="marketing-strategy">
                  {bp.marketing.marketingStrategy}
                </p>
                <div className="idea-features">
                  <div className="idea-feature-col"><h3>Platforms</h3><ul data-field="marketing-platforms">{bp.marketing.marketingPlatforms.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                  <div className="idea-feature-col"><h3>Content hooks</h3><ul data-field="content-hooks">{bp.marketing.contentHooks.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                  <div className="idea-feature-col"><h3>UGC formats</h3><ul data-field="ugc-formats">{bp.marketing.ugcFormats.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                </div>
                <div className="idea-features">
                  <div className="idea-feature-col"><h3>Campaign ideas</h3><ul data-field="campaign-ideas">{bp.marketing.campaignIdeas.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                  <div className="idea-feature-col"><h3>Creator types</h3><ul data-field="creator-types">{bp.marketing.creatorTypes.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                  <div className="idea-feature-col"><h3>Key selling points</h3><ul data-field="key-selling-points">{bp.marketing.keySellingPoints.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                </div>
                <div className="idea-reqs">
                  <h3>ASO keywords</h3>
                  <ul data-field="aso-keywords">{bp.marketing.asoKeywords.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  <h3>Go-to-market</h3>
                  <p data-field="go-to-market">{bp.marketing.goToMarket}</p>
                </div>
                <p className="idea-opportunity-note">AI-generated plan — a starting point, not a guarantee.</p>
              </>
            ) : (
              <p className="idea-opportunity-note" style={{ marginTop: 0 }}>
                Marketing plan is being generated for this idea — check back soon.
              </p>
            )}
            <div className="idea-panel-grid">
              <div className="idea-fact">
                <span className="k">Positioning</span>
                <span className="v" data-field="positioning">{idea.ideaCategory}</span>
                <p>{idea.description}</p>
              </div>
              <div className="idea-fact">
                <span className="k">Category to rank in</span>
                <span className="v" data-field="category-to-rank">{idea.sourceCategory}</span>
                <p>
                  The source app proves search demand here — start ASO research with the Keyword
                  Explorer on this category's terms.
                </p>
              </div>
              <div className="idea-fact">
                <span className="k">Proof of demand</span>
                <span className="v" data-field="proof-of-demand">{compact(idea.reviews)} reviews</span>
                <p>
                  The source app holds a {idea.rating.toFixed(1)}★ rating
                  {idea.revenue ? ` and an estimated $${compact(idea.revenue)}/mo` : ""} — an
                  audience already paying for this job-to-be-done.
                </p>
              </div>
            </div>
          </section>
        )}

        {similar.length > 0 && (
          <section className="idea-similar" data-section="similar">
            <h3>Similar ideas</h3>
            <div className="idea-similar-rail">
              {similar.map((s) =>
                s.storeAppId ? (
                  <Link key={s.id} to={ideaHref(s)} className="idea-similar-card">
                    <strong>{s.title}</strong>
                    <span className="muted">{s.ideaCategory} · {compact(s.reviews)} reviews</span>
                  </Link>
                ) : null,
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
