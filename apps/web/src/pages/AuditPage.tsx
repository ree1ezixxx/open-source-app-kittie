import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { AuditMetricInput, AuditReport, ConfidenceScore } from "@kittie/types";
import { DetailCard, Fact } from "../components/DetailCard";
import { MetricCard } from "../components/MetricCard";
import { PageShell } from "../components/PageShell";
import { IconChart, IconInfo } from "../icons";
import { getAuditReport, listApps } from "../lib/api";
import { formatCompact, formatDate } from "../lib/format";
import type { Theme } from "../lib/theme";

function confidenceTone(confidence: ConfidenceScore): string {
  if (confidence.label === "High") return "var(--positive)";
  if (confidence.label === "Medium") return "var(--accent)";
  if (confidence.label === "Low") return "var(--warn)";
  return "var(--danger)";
}

function formatInput(input: AuditMetricInput): string {
  if (input.value == null) return "Missing";
  if (input.unit === "count") return formatCompact(Number(input.value));
  if (input.unit === "rank") return `#${input.value}`;
  if (input.unit === "score") return `${input.value}/100`;
  if (input.unit === "date") return formatDate(String(input.value));
  if (input.unit === "percent") return `${input.value}%`;
  return String(input.value);
}

export function AuditPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [report, setReport] = useState<AuditReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const appId = searchParams.get("app");

  useEffect(() => {
    const ac = new AbortController();
    async function load() {
      setError(null);
      try {
        let id = appId;
        if (!id) {
          const apps = await listApps({ limit: 1, sortBy: "reviews", sortOrder: "desc" }, ac.signal);
          id = apps.data[0]?.id ?? null;
          if (id) setSearchParams({ app: id }, { replace: true });
        }
        if (!id) {
          setError("No seeded app found.");
          return;
        }
        setReport(await getAuditReport(id, ac.signal));
      } catch (e) {
        if (!ac.signal.aborted) setError(e instanceof Error ? e.message : "Failed to load audit.");
      }
    }
    void load();
    return () => ac.abort();
  }, [appId, setSearchParams]);

  const momentum = report?.subScores.find((s) => s.name === "Momentum") ?? null;
  const evidence = report?.evidence[0] ?? null;

  return (
    <PageShell
      icon={<IconInfo />}
      title="Audit"
      sub="Contract tracer for one app's market evidence."
      theme={theme}
      onToggleTheme={onToggleTheme}
      bodyClass="audit-body"
    >
      {error && (
        <DetailCard title="Audit unavailable">
          <Fact label="Status">{error}</Fact>
        </DetailCard>
      )}

      {!report && !error && (
        <DetailCard title="Loading audit">
          <Fact label="Status">Loading</Fact>
        </DetailCard>
      )}

      {report && (
        <>
          <DetailCard title={report.app.title}>
            <div className="audit-header">
              {report.app.iconUrl && <img className="audit-icon" src={report.app.iconUrl} alt="" />}
              <div className="audit-facts">
                <Fact label="Developer">{report.app.developer}</Fact>
                <Fact label="Category">{report.app.category ?? "Unknown"}</Fact>
                <Fact label="Store">{report.app.store}</Fact>
                <Fact label="App">
                  <Link to={`/apps/${encodeURIComponent(report.app.id)}`}>{report.app.storeAppId}</Link>
                </Fact>
              </div>
            </div>
          </DetailCard>

          <div className="metrics-row">
            <MetricCard
              label="Momentum"
              value={momentum?.value != null ? Math.round(momentum.value) : "—"}
              sub="/100"
              icon={<IconChart style={{ width: 16, height: 16 }} />}
            />
            <MetricCard
              label="Confidence"
              value={<span style={{ color: confidenceTone(report.confidence) }}>{report.confidence.label}</span>}
              sub={`${report.confidence.value}/100`}
            />
          </div>

          {evidence && (
            <DetailCard title={evidence.title}>
              <div className="audit-evidence">
                <Fact label="Coverage">{evidence.sourceStatus}</Fact>
                <Fact label="Observed">{formatDate(evidence.observedAt)}</Fact>
                {evidence.inputs.map((input) => (
                  <Fact key={input.label} label={`${input.label} · ${input.sourceStatus}`}>
                    {formatInput(input)}
                  </Fact>
                ))}
              </div>
            </DetailCard>
          )}
        </>
      )}
    </PageShell>
  );
}
