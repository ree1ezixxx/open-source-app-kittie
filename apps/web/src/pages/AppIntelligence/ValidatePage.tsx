import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "../../styles/intelligence.css";
import { DecisionPacketCard } from "../../components/DecisionPacketCard";
import { AgentView } from "../../components/intelligence/AgentView";
import { IconArrowLeft } from "../../icons";
import { validateIdea } from "../../lib/intelligence/client";
import { pushRecent } from "../../lib/intelligence/recents";
import type { SimilarApp, ValidateOutput } from "../../lib/intelligence/types";

function PreviewBadge() {
  return (
    <span className="intel-preview" title="Wired to a preview fixture until the validation endpoint lands">
      <span className="intel-preview-dot" /> Preview data
    </span>
  );
}

function MiniCompetitor({ app }: { app: SimilarApp }) {
  return (
    <li>
      <div className="li-head">
        {app.name} <span className="sim-cat">· {Math.round(app.similarityScore * 100)}% match</span>
      </div>
      <div className="li-sub">{app.reasons[0]}</div>
    </li>
  );
}

export function ValidatePage() {
  const [sp, setSp] = useSearchParams();
  const idea = sp.get("idea") ?? "";
  const [input, setInput] = useState(idea);
  const [result, setResult] = useState<ValidateOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const recorded = useRef<string>("");

  useEffect(() => setInput(idea), [idea]);

  useEffect(() => {
    if (!idea) {
      setResult(null);
      return;
    }
    let alive = true;
    setLoading(true);
    const ctrl = new AbortController();
    validateIdea(idea, ctrl.signal)
      .then((r) => {
        if (!alive) return;
        setResult(r);
        if (recorded.current !== idea) {
          pushRecent({ kind: "validate", label: r.interpretedIdea, href: `/intelligence/validate?idea=${encodeURIComponent(idea)}` });
          recorded.current = idea;
        }
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [idea]);

  function submit() {
    const v = input.trim();
    if (v) setSp({ idea: v }, { replace: false });
  }

  return (
    <main className="main">
      <div className="intel">
        <div className="intel-crumb">
          <Link to="/intelligence">
            <IconArrowLeft style={{ width: 12, height: 12 }} /> App Intelligence
          </Link>
          <span>/ Validate</span>
        </div>
        <h1 className="intel-title">Validate an app idea</h1>
        <p className="intel-sub">
          Describe the app you're thinking of building. You'll get a verdict, an honest score, the wedge to take, the
          competitors in the way, an MVP and the risks — with the evidence and confidence behind each.
        </p>

        <div className="intel-form">
          <textarea
            className="intel-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            placeholder="e.g. A guided meditation app for UK adults"
            spellCheck={false}
            rows={2}
          />
          <button className="intel-submit" onClick={submit} disabled={!input.trim()}>
            Validate
          </button>
        </div>

        {loading && (
          <div className="intel-loading">
            <div className="intel-skel" style={{ height: 150 }} />
            <div className="intel-skel" style={{ height: 90 }} />
          </div>
        )}

        {!loading && result && (
          <>
            {result.source === "mock" && <div style={{ marginBottom: 14 }}><PreviewBadge /></div>}

            <p className="intel-interpreted">
              Interpreted as: <b>{result.interpretedIdea}</b>
            </p>

            {/* ---- above the fold: verdict · score · confidence · evidence · next ---- */}
            <DecisionPacketCard packet={result.verdict} category={null} />

            <div className="intel-overall">
              <span className="intel-overall-num">{result.overallScore}</span>
              <span className="intel-overall-max">/ 100 overall</span>
            </div>

            <div className="intel-angle">
              <strong>Recommended angle.</strong> {result.recommendedAngle}
            </div>

            {/* ---- progressive disclosure ---- */}
            <section className="intel-section">
              <h3>Score breakdown</h3>
              {result.scoreBreakdown.map((f) => (
                <div className="score-row" key={f.label}>
                  <span className="score-label">{f.label}</span>
                  <span className="score-track">
                    <span className={`score-fill${f.score < 40 ? " lo" : ""}`} style={{ width: `${f.score}%` }} />
                  </span>
                  <span className="score-num">{f.score}</span>
                  <span className="score-rationale">{f.rationale}</span>
                </div>
              ))}
            </section>

            <section className="intel-section">
              <h3>Competitors in the way</h3>
              <p className="intel-interpreted">
                <b>{result.competitorSummary.count}</b> · {result.competitorSummary.saturation}
              </p>
              <ul className="intel-list">
                {result.competitorSummary.top.map((a) => (
                  <MiniCompetitor app={a} key={a.appId} />
                ))}
              </ul>
            </section>

            <section className="intel-section">
              <h3>Minimum viable product</h3>
              <ul className="intel-list">
                {result.mvp.map((m) => (
                  <li key={m.feature}>
                    <div className="li-head">{m.feature}</div>
                    <div className="li-sub">{m.why}</div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="intel-section">
              <h3>Risks</h3>
              <ul className="intel-list">
                {result.risks.map((r) => (
                  <li key={r.risk}>
                    <div className="risk-row">
                      <span className={`risk-sev ${r.severity}`}>{r.severity}</span>
                      <div>
                        <div className="li-head">{r.risk}</div>
                        {r.mitigation && <div className="li-sub">Mitigation: {r.mitigation}</div>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <AgentView summary={result.agentSummary} data={result} source={result.source} label="Agent view · validation" />
          </>
        )}
      </div>
    </main>
  );
}
