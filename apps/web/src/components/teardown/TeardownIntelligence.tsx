import { useEffect, useState } from "react";
import type { AppDetail } from "@kittie/types";
import "../../styles/intelligence.css";
import { DecisionPacketCard } from "../DecisionPacketCard";
import { AgentView } from "../intelligence/AgentView";
import { IconExternal } from "../../icons";
import { teardownApp } from "../../lib/intelligence/client";
import type { TeardownOutput } from "../../lib/intelligence/types";

/**
 * Structured teardown intelligence that ENRICHES (never replaces) the react-flow
 * canvas: the strategic thesis, core loop, feature map, monetisation, review
 * gaps, clone insights, evidence and the agent-readable block — flowed beneath
 * the canvas (PRD §7.9). Mock-first via `teardownApp()`; real-wires to Lane B
 * with no UI change.
 */
export function TeardownIntelligence({ app }: { app: AppDetail }) {
  const [data, setData] = useState<TeardownOutput | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const ctrl = new AbortController();
    teardownApp(app.id, app.title, ctrl.signal)
      .then((d) => alive && setData(d))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [app.id, app.title]);

  return (
    <div className="intel" style={{ paddingTop: 24 }}>
      <div className="intel-crumb" style={{ marginBottom: 14 }}>
        Teardown intelligence
        {data?.source === "mock" && (
          <span className="intel-preview" title="Wired to a preview fixture until the teardown endpoint lands">
            <span className="intel-preview-dot" /> Preview data
          </span>
        )}
      </div>

      {loading || !data ? (
        <div className="intel-loading">
          <div className="intel-skel" style={{ height: 120 }} />
          <div className="intel-skel" style={{ height: 80 }} />
        </div>
      ) : (
        <div className="td-intel">
          {/* thesis — the dominant strategic decision for this app */}
          <DecisionPacketCard packet={data.thesis} category={app.category} />

          <div className="td-intel-section">
            <h4>Core loop</h4>
            <ol className="td-loop">
              {data.coreLoop.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>

          <div className="td-intel-section">
            <h4>Feature map</h4>
            {data.featureMap.map((f) => (
              <div className="td-feature" key={f.feature}>
                <b>{f.feature}</b>
                <span>
                  {f.role}
                  {f.evidence ? ` — ${f.evidence}` : ""}
                </span>
              </div>
            ))}
          </div>

          <div className="td-intel-section">
            <h4>Monetisation</h4>
            <div className="li-head">{data.monetisation.model}</div>
            <div className="li-sub" style={{ marginBottom: 8 }}>
              {data.monetisation.detail}
            </div>
            <div className="td-chips">
              {data.monetisation.signals.map((s, i) => (
                <span className="td-chip" key={i}>
                  {s}
                </span>
              ))}
            </div>
          </div>

          <div className="td-intel-section">
            <h4>Review gaps — unmet demand</h4>
            <ul className="intel-list">
              {data.reviewGaps.map((g) => (
                <li key={g.gap}>
                  <div className="li-head">{g.gap}</div>
                  <div className="li-sub">
                    {g.demandSignal} · {g.sourceCount} reviews
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="td-intel-section">
            <h4>Clone insights</h4>
            <ul className="intel-list">
              {data.cloneInsights.map((c) => (
                <li key={c.insight}>
                  <div className="risk-row">
                    <span className={`risk-sev ${c.difficulty === "high" ? "high" : c.difficulty === "medium" ? "medium" : "low"}`}>
                      {c.difficulty}
                    </span>
                    <div className="li-head">{c.insight}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {data.evidence.length > 0 && (
            <div className="td-intel-section">
              <h4>Evidence</h4>
              <ul className="decision-evidence">
                {data.evidence.map((e, i) => (
                  <li key={i}>
                    <span className="ev-kind">{e.valueType}</span>
                    <span className="ev-claim">{e.claim}</span>
                    {e.sourceUrl && (
                      <a className="ev-src" href={e.sourceUrl} target="_blank" rel="noreferrer" aria-label="View source">
                        <IconExternal />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <AgentView summary={data.agentSummary} data={data} source={data.source} label="Agent view · teardown" />
        </div>
      )}
    </div>
  );
}
