/* ============================================================
   Additive lane — Research Chat. /dashboard/intel/chat
   Gemini grounded on the LOCAL database via the one LLM seam.
   Honest gating: no GEMINI_API_KEY → full-page disabled state,
   never a faked answer. Grounding facts shown under each reply.
   ============================================================ */
import { useEffect, useRef, useState } from "react";
import { PageShell } from "../../components/PageShell";
import { IconInfo, IconSpark } from "../../icons";
import {
  askResearchQuestion,
  fetchAssistStatus,
  type AssistStatus,
} from "../../lib/api/assist";
import type { Theme } from "../../lib/theme";
import "../../styles/assist.css";

interface Turn {
  role: "user" | "assistant";
  text: string;
  grounding?: string[];
}

const SUGGESTIONS = [
  "Which categories are growing fastest right now?",
  "Summarize what users complain about in Health & Fitness",
  "Which tracked app moved most this week?",
];

export function ResearchChatPage({
  theme,
  onToggleTheme,
}: {
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const [status, setStatus] = useState<AssistStatus | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetchAssistStatus(ac.signal)
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, model: null, ideasAvailable: false }));
    return () => ac.abort();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  async function ask(q?: string) {
    const question = (q ?? input).trim();
    if (!question || busy) return;
    setInput("");
    setTurns((t) => [...t, { role: "user", text: question }]);
    setBusy(true);
    try {
      const res = await askResearchQuestion(question);
      setTurns((t) => [
        ...t,
        res.enabled && res.answer
          ? { role: "assistant", text: res.answer, grounding: res.grounding }
          : {
              role: "assistant",
              text: "The Gemini seam is not available right now (missing key or quota). No answer was generated.",
            },
      ]);
    } catch (e) {
      setTurns((t) => [
        ...t,
        { role: "assistant", text: `Request failed: ${e instanceof Error ? e.message : "unknown error"}` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  const disabled = status !== null && !status.enabled;

  return (
    <PageShell
      title="Research Chat"
      sub="Ask in plain language — answered only from your local database"
      theme={theme}
      onToggleTheme={onToggleTheme}
    >
      <div className="assist-wrap">
        {status === null && <div className="assist-empty">Loading…</div>}

        {disabled && (
          <div className="assist-empty">
            <div className="assist-empty-title">
              <IconSpark style={{ width: 16, height: 16 }} /> AI chat needs the Gemini seam
            </div>
            <p>
              Set <code>GEMINI_API_KEY</code> in <code>.env</code> and restart the API. The free
              key is heavily rate-limited (~20 requests/day/model) — answers are grounded on your
              local data and used frugally. Until then this surface stays honestly off; it never
              fakes a response.
            </p>
          </div>
        )}

        {status?.enabled && (
          <>
            <div className="assist-thread">
              {turns.length === 0 && (
                <div className="assist-suggest">
                  <p className="assist-suggest-label">Try:</p>
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className="assist-chip" onClick={() => ask(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {turns.map((t, i) => (
                <div key={i} className={`assist-turn ${t.role}`}>
                  <div className="assist-bubble">{t.text}</div>
                  {t.grounding && t.grounding.length > 0 && (
                    <details className="assist-grounding">
                      <summary>
                        <IconInfo style={{ width: 11, height: 11 }} /> answered from{" "}
                        {t.grounding.length} facts
                      </summary>
                      <ul>
                        {t.grounding.map((g, j) => (
                          <li key={j}>{g}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              ))}
              {busy && <div className="assist-turn assistant"><div className="assist-bubble assist-thinking">Thinking…</div></div>}
              <div ref={endRef} />
            </div>

            <form
              className="assist-inputbar"
              onSubmit={(e) => {
                e.preventDefault();
                void ask();
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Why is this niche growing? What do users want?"
                disabled={busy}
              />
              <button className="btn btn-accent" type="submit" disabled={busy || !input.trim()}>
                Ask
              </button>
            </form>
          </>
        )}
      </div>
    </PageShell>
  );
}
