import { useState } from "react";
import { Link } from "react-router-dom";
import { formatCaveatLine, formatConfidence, formatEvidenceLine } from "@kittie/reports/browser";
import { PageShell } from "../components/PageShell";
import { EmptyState } from "../components/EmptyState";
import type { Theme } from "../lib/theme";
import { EXAMPLE_PROMPTS, planQuery, SUPPORTED_ACTIONS, type AskPlan } from "../lib/ask/planner";
import { runAsk, type AskResult } from "../lib/ask/execute";

/**
 * `/ask` — the thin, deterministic front door. A question is planned to one of
 * four grounded intelligence intents (no LLM); the answer is a readout of the
 * #180 envelope's evidence/confidence/caveats. Unparseable → honest state.
 */
export function AskPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const [input, setInput] = useState("");
  const [plan, setPlan] = useState<AskPlan | null>(null);
  const [result, setResult] = useState<AskResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(query: string) {
    const q = query.trim();
    setInput(query);
    setError(null);
    setResult(null);
    const p = planQuery(q);
    setPlan(p);
    if (p.intent === "unsupported") return;
    setLoading(true);
    try {
      setResult(await runAsk(p));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell title="Ask" sub="Grounded intelligence — deterministic, no chatbot" theme={theme} onToggleTheme={onToggleTheme}>
      <div style={{ padding: "1rem", maxWidth: "58rem" }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
          style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}
        >
          <input
            placeholder="Ask about an app, a trend, a comparison, or an idea…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{ flex: 1, padding: "0.6rem" }}
          />
          <button type="submit" disabled={loading} style={{ padding: "0.6rem 1rem" }}>
            {loading ? "Asking…" : "Ask"}
          </button>
        </form>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1.25rem" }}>
          {EXAMPLE_PROMPTS.map((ex) => (
            <button key={ex.query} onClick={() => void ask(ex.query)} style={{ padding: "0.3rem 0.7rem", opacity: 0.85 }}>
              {ex.label}
            </button>
          ))}
        </div>

        {error && <div style={{ color: "var(--danger, #b00)", marginBottom: "1rem" }}>{error}</div>}

        {plan?.intent === "unsupported" && (
          <EmptyState
            title="I can't answer that yet"
            sub={plan.reason}
            action={
              <ul style={{ textAlign: "left", opacity: 0.8, marginTop: "0.5rem", lineHeight: 1.6 }}>
                {SUPPORTED_ACTIONS.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            }
          />
        )}

        {result && (
          <section style={{ border: "1px solid var(--border, #ddd)", borderRadius: "0.5rem", padding: "1rem" }}>
            <div style={{ fontWeight: 600 }}>{result.title}</div>
            <p style={{ marginTop: "0.25rem" }}>{result.summary}</p>

            <div style={{ margin: "0.5rem 0", opacity: 0.85 }}>
              <strong>Confidence:</strong> {result.confidence ? formatConfidence(result.confidence) : "—"}
            </div>

            <details open>
              <summary style={{ cursor: "pointer" }}>Evidence ({result.evidence.length})</summary>
              {result.evidence.length > 0 ? (
                <ul style={{ opacity: 0.85 }}>
                  {result.evidence.map((e) => (
                    <li key={e.id}>{formatEvidenceLine(e)}</li>
                  ))}
                </ul>
              ) : (
                <p style={{ opacity: 0.6, fontStyle: "italic" }}>No evidence recorded.</p>
              )}
            </details>

            {result.caveats.length > 0 && (
              <details>
                <summary style={{ cursor: "pointer" }}>Caveats ({result.caveats.length})</summary>
                <ul style={{ opacity: 0.85 }}>
                  {result.caveats.map((c, i) => (
                    <li key={i}>{formatCaveatLine(c)}</li>
                  ))}
                </ul>
              </details>
            )}

            {result.reportHref && (
              <div style={{ marginTop: "0.75rem" }}>
                <Link to={result.reportHref}>Open full report →</Link>
              </div>
            )}
          </section>
        )}
      </div>
    </PageShell>
  );
}
