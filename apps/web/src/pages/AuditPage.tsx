import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { AuditReport, SourceStatus } from "@kittie/types";
import { getAudit } from "../lib/api";
import "./audit.css";

// Audit Engine — first surface (epic #168, slice #170). Renders an AuditReport
// for ?app=<id>: sub-scores + confidence label + traceable evidence cards.
export function AuditPage() {
  const [params] = useSearchParams();
  const appId = params.get("app");
  const [report, setReport] = useState<AuditReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!appId) {
      setError("Add ?app=<id> to audit an app.");
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    getAudit(appId, ac.signal)
      .then((d) => !ac.signal.aborted && setReport(d))
      .catch((e) => !ac.signal.aborted && setError(e.message))
      .finally(() => !ac.signal.aborted && setLoading(false));
    return () => ac.abort();
  }, [appId]);

  if (loading) return <div className="audit-page audit-msg">Auditing…</div>;
  if (error) return <div className="audit-page audit-msg">{error}</div>;
  if (!report) return <div className="audit-page audit-msg">No audit.</div>;

  const conf = report.confidence;
  return (
    <div className="audit-page">
      <header className="audit-head">
        <div className="audit-eyebrow">audit · what can I build from this?</div>
        <h1>{report.appName}</h1>
        <div className="audit-sub">
          {report.category ?? "Uncategorised"}
          <span className={`audit-conf conf-${conf.label.toLowerCase()}`}>
            {conf.label} confidence · {Math.round(conf.value * 100)}%
          </span>
        </div>
        {conf.reasons.length > 0 && (
          <div className="audit-conf-reasons">{conf.reasons.join(" · ")}</div>
        )}
      </header>

      <section className="audit-sources" aria-label="Signal sources">
        {report.sources.map((s) => (
          <span className="audit-source-chip" key={s.key} title={s.note ?? ""}>
            {s.label}: <SourceBadge status={s.status} />
          </span>
        ))}
      </section>

      <section className="audit-scores">
        {report.scores.map((s) => (
          <div className="audit-score" key={s.name}>
            <div className="audit-score-top">
              <span className="audit-score-label">{s.label}</span>
              <SourceBadge status={s.sourceStatus} />
            </div>
            <div className="audit-score-value">
              {s.value == null ? "—" : s.value}
              <span className="audit-score-max">{s.value == null ? "" : "/100"}</span>
            </div>
            {s.value != null && (
              <div className="audit-meter">
                <i style={{ width: `${s.value}%` }} />
              </div>
            )}
            {s.note && <div className="audit-score-note">{s.note}</div>}
          </div>
        ))}
      </section>

      <section className="audit-evidence">
        <h2>Evidence</h2>
        <div className="audit-cards">
          {report.evidence.map((e) => (
            <div className="audit-card" key={e.id}>
              <div className="audit-card-top">
                <span className="audit-card-kind">{e.kind}</span>
                <SourceBadge status={e.sourceStatus} />
              </div>
              <div className="audit-card-title">{e.title}</div>
              <div className="audit-card-detail">{e.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="audit-foot">
        Generated {new Date(report.generatedAt).toLocaleString()} · estimates are modelled, not
        ground truth.
      </footer>
    </div>
  );
}

function SourceBadge({ status }: { status: SourceStatus }) {
  return <span className={`audit-srcbadge src-${status}`}>{status}</span>;
}
