import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { AuditReport, BuildBrief, SourceStatus } from "@kittie/types";
import { getAudit, getBuildBrief } from "../lib/api";
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

      {report.painClusters && report.painClusters.length > 0 && (
        <section className="audit-pain">
          <h2>User pain · buildable angles</h2>
          <div className="audit-cards">
            {report.painClusters.slice(0, 6).map((p) => (
              <div className="audit-card" key={p.theme}>
                <div className="audit-card-top">
                  <span className="audit-card-kind">{p.theme}</span>
                  <span className="audit-pain-freq">{p.frequency}× · {Math.round(p.share * 100)}%</span>
                </div>
                <div className="audit-card-title">{p.opportunity}</div>
                {p.exampleReviews[0] && (
                  <div className="audit-pain-quote">"{p.exampleReviews[0]}"</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

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

      {appId && <BriefExport appId={appId} />}

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

const BRIEF_FORMATS: { key: keyof BuildBrief; label: string; ext: string }[] = [
  { key: "markdown", label: "Markdown", ext: "md" },
  { key: "githubIssues", label: "GitHub issues", ext: "md" },
  { key: "claudeCodePrompt", label: "Claude Code", ext: "txt" },
  { key: "codexPrompt", label: "Codex", ext: "txt" },
  { key: "rorkPrompt", label: "Rork", ext: "txt" },
  { key: "json", label: "JSON", ext: "json" },
  { key: "mcpCall", label: "MCP call", ext: "txt" },
];

function BriefExport({ appId }: { appId: string }) {
  const [brief, setBrief] = useState<BuildBrief | null>(null);
  const [fmt, setFmt] = useState<keyof BuildBrief>("markdown");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () => {
    setLoading(true);
    setErr(null);
    getBuildBrief(appId)
      .then(setBrief)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  const content = brief ? String(brief[fmt] ?? "") : "";

  const copy = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const download = () => {
    const ext = BRIEF_FORMATS.find((f) => f.key === fmt)?.ext ?? "txt";
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `build-brief.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="audit-export">
      <h2>Export to builder</h2>
      {!brief && (
        <button className="audit-btn primary" onClick={load} disabled={loading}>
          {loading ? "Generating…" : "Generate build brief"}
        </button>
      )}
      {err && <div className="audit-msg">{err}</div>}
      {brief && (
        <>
          <div className="audit-fmt-tabs">
            {BRIEF_FORMATS.map((f) => (
              <button
                key={f.key}
                className={`audit-fmt ${fmt === f.key ? "active" : ""}`}
                onClick={() => setFmt(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="audit-export-actions">
            <button className="audit-btn" onClick={copy}>
              {copied ? "Copied ✓" : "Copy"}
            </button>
            <button className="audit-btn" onClick={download}>
              Download
            </button>
          </div>
          <pre className="audit-brief-code">{content}</pre>
        </>
      )}
    </section>
  );
}
