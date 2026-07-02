import { Link } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import type { Theme } from "../lib/theme";
import type { ReportTemplateId } from "../lib/reports/generate";

const TEMPLATES: { id: ReportTemplateId; title: string; desc: string; needs: string }[] = [
  {
    id: "app_teardown",
    title: "App teardown",
    desc: "Full intelligence profile for one app — listing facts, modelled estimates, evidence, confidence and caveats.",
    needs: "an app id",
  },
  {
    id: "category_pulse",
    title: "Category pulse",
    desc: "Ranked movement and opportunities for a category and market over a period.",
    needs: "a category / market",
  },
  {
    id: "build_brief",
    title: "Build brief",
    desc: "Turn an idea validation into a build handoff — thesis, competitors, risks, and derived tasks.",
    needs: "an app idea",
  },
];

/**
 * `/reports` — thin index. Kittie is local-first and does not persist report
 * history, so there is no saved-report list; instead the surface is the set of
 * report templates you can generate on demand.
 */
export function ReportsPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  return (
    <PageShell
      title="Reports"
      sub="Local-first, evidence-backed report artifacts — generated on demand"
      theme={theme}
      onToggleTheme={onToggleTheme}
    >
      <div style={{ padding: "1rem", maxWidth: "56rem" }}>
        <p style={{ opacity: 0.7, marginBottom: "1.25rem" }}>
          Reports are generated on demand and not stored — Kittie keeps no report history (local-first). Pick a
          template to generate an evidence-backed report you can copy or download.
        </p>
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {TEMPLATES.map((t) => (
            <Link
              key={t.id}
              to={`/reports/${t.id}`}
              style={{
                display: "block",
                padding: "1rem",
                border: "1px solid var(--border, #ddd)",
                borderRadius: "0.5rem",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ fontWeight: 600 }}>{t.title}</div>
              <div style={{ opacity: 0.7, fontSize: "0.9rem", marginTop: "0.25rem" }}>{t.desc}</div>
              <div style={{ opacity: 0.55, fontSize: "0.8rem", marginTop: "0.4rem" }}>Needs {t.needs}.</div>
            </Link>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
