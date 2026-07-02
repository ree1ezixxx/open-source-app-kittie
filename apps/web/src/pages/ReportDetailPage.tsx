import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { EmptyState } from "../components/EmptyState";
import type { Theme } from "../lib/theme";
import {
  generateReport,
  REPORT_TEMPLATES,
  type GeneratedReport,
  type ReportFormatId,
  type ReportParams,
  type ReportTemplateId,
} from "../lib/reports/generate";

const TITLES: Record<ReportTemplateId, string> = {
  app_teardown: "App teardown",
  category_pulse: "Category pulse",
  build_brief: "Build brief",
};

const EXT: Record<ReportFormatId, string> = { markdown: "md", json: "json", html: "html" };

function isTemplate(v: string | undefined): v is ReportTemplateId {
  return !!v && (REPORT_TEMPLATES as readonly string[]).includes(v);
}

export function ReportDetailPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const { template } = useParams<{ template: string }>();
  const [params, setParams] = useState<ReportParams>({ country: "US", period: "7d" });
  const [report, setReport] = useState<GeneratedReport | null>(null);
  const [format, setFormat] = useState<ReportFormatId>("markdown");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isTemplate(template)) {
    return (
      <PageShell title="Reports" theme={theme} onToggleTheme={onToggleTheme}>
        <EmptyState title="Unknown report template" sub="Pick a template from the Reports index." action={<Link to="/reports">Back to reports</Link>} />
      </PageShell>
    );
  }

  const set = (patch: Partial<ReportParams>) => setParams((p) => ({ ...p, ...patch }));

  async function onGenerate() {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const result = await generateReport(template as ReportTemplateId, params);
      setReport(result);
      setFormat("markdown");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function copy(content: string) {
    navigator.clipboard?.writeText(content).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => setError("Copy failed — your browser blocked clipboard access."),
    );
  }

  function htmlBlobUrl(content: string): string {
    return URL.createObjectURL(new Blob([content], { type: "text/html" }));
  }

  function download(content: string, contentType: string) {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([content], { type: contentType }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.reportId}.${EXT[format]}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const active = report?.formats[format];

  return (
    <PageShell
      title={TITLES[template]}
      sub="Generate an evidence-backed report"
      theme={theme}
      onToggleTheme={onToggleTheme}
      actions={<Link to="/reports">All reports</Link>}
    >
      <div style={{ padding: "1rem", maxWidth: "60rem" }}>
        {/* ── Inputs ── */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
          {template === "app_teardown" && (
            <input
              placeholder="App id — e.g. apple:6446901002"
              value={params.appId ?? ""}
              onChange={(e) => set({ appId: e.target.value })}
              style={{ flex: "1 1 20rem", padding: "0.5rem" }}
            />
          )}
          {template === "build_brief" && (
            <input
              placeholder="App idea — e.g. a focus timer for exam-week students"
              value={params.idea ?? ""}
              onChange={(e) => set({ idea: e.target.value })}
              style={{ flex: "1 1 24rem", padding: "0.5rem" }}
            />
          )}
          {template === "category_pulse" && (
            <>
              <input placeholder="Category (optional)" value={params.category ?? ""} onChange={(e) => set({ category: e.target.value })} style={{ flex: "1 1 14rem", padding: "0.5rem" }} />
              <input placeholder="Country" value={params.country ?? ""} onChange={(e) => set({ country: e.target.value })} style={{ width: "6rem", padding: "0.5rem" }} />
              <select value={params.period ?? "7d"} onChange={(e) => set({ period: e.target.value })} style={{ padding: "0.5rem" }}>
                {["7d", "14d", "30d", "60d", "90d"].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </>
          )}
          <button onClick={onGenerate} disabled={loading} style={{ padding: "0.5rem 1rem" }}>
            {loading ? "Generating…" : "Generate report"}
          </button>
        </div>

        {error && <div style={{ color: "var(--danger, #b00)", marginBottom: "1rem" }}>{error}</div>}

        {/* ── Result ── */}
        {report && active && (
          <div>
            <div style={{ marginBottom: "0.75rem", fontSize: "0.85rem", opacity: 0.75 }}>
              <strong>{report.title}</strong> · id <code>{report.reportId}</code>
              {report.generatedAt ? ` · generated ${report.generatedAt}` : ""} · {active.byteLength} bytes
            </div>

            <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
              {(["markdown", "json", "html"] as ReportFormatId[]).map((f) => (
                <button key={f} onClick={() => setFormat(f)} style={{ padding: "0.3rem 0.7rem", fontWeight: f === format ? 700 : 400 }}>
                  {f.toUpperCase()}
                </button>
              ))}
              <span style={{ flex: 1 }} />
              {format !== "html" ? (
                <button onClick={() => copy(active.content)} style={{ padding: "0.3rem 0.7rem" }}>
                  {copied ? "Copied ✓" : `Copy ${format === "json" ? "JSON" : "Markdown"}`}
                </button>
              ) : (
                <>
                  <a href={htmlBlobUrl(active.content)} target="_blank" rel="noreferrer" style={{ padding: "0.3rem 0.7rem" }}>
                    Open HTML
                  </a>
                  <button onClick={() => download(active.content, active.contentType)} style={{ padding: "0.3rem 0.7rem" }}>
                    Download HTML
                  </button>
                </>
              )}
            </div>

            <pre
              style={{
                background: "var(--surface, #f6f6f4)",
                padding: "1rem",
                borderRadius: "0.5rem",
                overflow: "auto",
                maxHeight: "60vh",
                fontSize: "0.8rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {active.content}
            </pre>
          </div>
        )}

        {!report && !loading && !error && (
          <EmptyState title="No report yet" sub={`Enter the inputs above and generate a ${TITLES[template].toLowerCase()}.`} />
        )}
      </div>
    </PageShell>
  );
}
