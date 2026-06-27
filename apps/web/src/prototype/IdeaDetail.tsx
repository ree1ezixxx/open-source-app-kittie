import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { appBySlug, ideaForCategory, appsByCategory } from "./data";
import { Logo } from "./Logo";

export function IdeaDetail() {
  const { slug = "" } = useParams();
  const nav = useNavigate();
  const [toast, setToast] = useState<string | null>(null);

  const app = appBySlug(slug);
  const idea = app ? ideaForCategory(app.category) : undefined;

  if (!app || !idea) {
    return (
      <div className="pp-root">
        <div className="pp-detail">
          <div className="pp-back" onClick={() => nav("/")}>
            ← back to trending
          </div>
          <p style={{ fontFamily: "var(--pp-mono)", color: "var(--pp-ink-3)" }}>Idea not found.</p>
        </div>
      </div>
    );
  }

  const evidence = appsByCategory(app.category).slice(0, 6);
  const briefJson = JSON.stringify(
    {
      idea: idea.title,
      category: idea.category,
      confidence: idea.confidence,
      targetUser: idea.brief.targetUser,
      wedge: idea.wedge,
      mvp: idea.brief.mvp,
      screens: idea.brief.screens,
      coreLoop: idea.brief.coreLoop,
      dataModel: idea.brief.dataModel,
      monetization: idea.brief.monetizationPlan,
      stack: idea.stack,
      competitors: evidence.map((e) => e.name),
      risks: idea.brief.risks,
    },
    null,
    2,
  );

  const ping = (msg: string, text?: string) => {
    if (text && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  };

  return (
    <div className="pp-root">
      <div className="pp-detail">
        <div className="pp-back" onClick={() => nav(-1)}>
          ← back to trending
        </div>

        {/* 1 — summary / decision packet */}
        <div className="pp-packet">
          <div className="eyebrow">buildable idea · {idea.freshness}</div>
          <h1>{idea.title}</h1>
          <p className="lead">{idea.oneLiner}</p>
          <div className="pp-stat-grid">
            <div className="pp-stat">
              <div className="l">Confidence</div>
              <div className="v">{idea.confidence}/100</div>
              <div className="pp-meter">
                <i style={{ width: `${idea.confidence}%` }} />
              </div>
            </div>
            <div className="pp-stat">
              <div className="l">Category</div>
              <div className="v">{idea.category}</div>
            </div>
            <div className="pp-stat">
              <div className="l">Build difficulty</div>
              <div className="v">{idea.difficulty}</div>
            </div>
            <div className="pp-stat">
              <div className="l">Monetization</div>
              <div className="v">{idea.monetization}</div>
            </div>
            <div className="pp-stat">
              <div className="l">Freshness</div>
              <div className="v">{idea.freshness.split(" — ")[0]}</div>
            </div>
          </div>
        </div>

        {/* 2 — why now */}
        <section className="pp-section">
          <h3>Why this is trending</h3>
          <div className="pp-why">{idea.whyNow}</div>
          <ul className="pp-reasons">
            {idea.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>

        {/* 3 — source apps */}
        <section className="pp-section">
          <h3>Source apps · the evidence</h3>
          <div className="pp-evidence">
            {evidence.map((e) => (
              <div
                className="pp-tile"
                key={e.slug}
                onClick={() => nav(`/idea/${e.slug}`)}
                role="button"
                tabIndex={0}
              >
                <div className="pp-tile-top">
                  <Logo name={e.name} hue={e.hue} icon={e.icon} size={40} />
                  <div>
                    <div className="name">{e.name}</div>
                    <div className="cat">
                      {e.downloads}/mo · {e.revenue}/mo · ★{e.rating}
                    </div>
                  </div>
                </div>
                <div className="reason">{e.reason}</div>
                <div className="pp-tile-foot">
                  <span className={`pp-badge ${e.momentum}`}>{e.momentum}</span>
                  <span className="metric">open teardown →</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 4 — buildable wedge (key output) */}
        <section className="pp-section">
          <h3>Buildable wedge</h3>
          <div className="pp-wedge">
            <span className="lbl">build this</span>
            {idea.wedge}
          </div>
        </section>

        {/* 5 — estimated stack */}
        <section className="pp-section">
          <h3>Estimated stack · modelled, not verified</h3>
          <div className="pp-chips">
            {idea.stack.map((s) => (
              <span className="pp-chip est" key={s}>
                {s}
              </span>
            ))}
          </div>
        </section>

        {/* 6 — copy / avoid */}
        <section className="pp-section">
          <h3>What to copy · what to avoid</h3>
          <div className="pp-twocol">
            <div className="pp-card copy">
              <h4>Copy</h4>
              <ul>
                {idea.copy.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
            <div className="pp-card avoid">
              <h4>Don't copy</h4>
              <ul>
                {idea.avoid.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* 7 — agent build brief */}
        <section className="pp-section">
          <h3>Agent build brief</h3>
          <div className="pp-brief">
            <div className="pp-brief-head">
              <span className="t">Ship it to a coding harness</span>
              <div className="exp">
                <button className="pp-export go" onClick={() => ping("Clone-into-harness queued", briefJson)}>
                  Clone into Harness
                </button>
                <button className="pp-export" onClick={() => ping("Sent to Claude Code", briefJson)}>
                  Send to Claude Code
                </button>
                <button className="pp-export" onClick={() => ping("Sent to Codex", briefJson)}>
                  Send to Codex
                </button>
                <button
                  className="pp-export"
                  onClick={() =>
                    ping(
                      "MCP call copied",
                      `kittie.generate_build_brief({ idea: "${idea.title}", category: "${idea.category}", window: "7d" })`,
                    )
                  }
                >
                  Copy MCP call
                </button>
                <button className="pp-export" onClick={() => ping("JSON copied", briefJson)}>
                  Export JSON
                </button>
              </div>
            </div>
            <pre className="pp-code">
              <span className="c"># human runs the CLI…</span>
              {"\n"}$ kittie build-brief <span className="k2">"{idea.title}"</span> --target claude-code
              {"\n\n"}
              <span className="c"># …or the agent calls the MCP tool directly</span>
              {"\n"}kittie.<span className="k2">generate_build_brief</span>({"{"}
              {"\n"}  idea: <span className="k2">"{idea.title}"</span>,
              {"\n"}  category: <span className="k2">"{idea.category}"</span>,
              {"\n"}  evidence: [{evidence.slice(0, 3).map((e) => `"${e.name}"`).join(", ")}],
              {"\n"}  window: <span className="k2">"7d"</span>
              {"\n"}{"}"})
            </pre>
          </div>
        </section>
      </div>

      {toast && <div className="pp-toast">{toast}</div>}
    </div>
  );
}
