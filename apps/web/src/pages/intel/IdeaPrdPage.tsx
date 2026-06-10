/* ============================================================
   Additive lane — Idea → PRD bridge. /dashboard/intel/idea-prd
   One click from a stored Hot idea to a full PRD + Claude-Code
   prompt pack — the additive delta beyond AppKittie's "Export as
   prompt". Template-assembled ($0, always works); when the Gemini
   seam is live the Problem/Solution prose is sharpened with one
   frugal call. Honest empty state until the parity Hot Ideas
   pipeline has generated ideas.
   ============================================================ */
import { useEffect, useState } from "react";
import { PageShell } from "../../components/PageShell";
import { IconBulb, IconDownload, IconSearch } from "../../icons";
import {
  fetchAssistStatus,
  fetchIdeas,
  generatePrd,
  type IdeaSummary,
  type PrdResult,
} from "../../lib/api/assist";
import type { Theme } from "../../lib/theme";
import "../../styles/assist.css";

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function IdeaPrdPage({
  theme,
  onToggleTheme,
}: {
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [seamEnabled, setSeamEnabled] = useState(false);
  const [ideas, setIdeas] = useState<IdeaSummary[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<IdeaSummary | null>(null);
  const [result, setResult] = useState<PrdResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchAssistStatus()
      .then((s) => setSeamEnabled(s.enabled))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      fetchIdeas(search || undefined, ac.signal)
        .then((r) => {
          setAvailable(r.available);
          setIdeas(r.ideas);
        })
        .catch(() => setAvailable(false));
    }, 200);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [search]);

  async function generate(idea: IdeaSummary) {
    setSelected(idea);
    setResult(null);
    setBusy(true);
    try {
      setResult(await generatePrd(idea.id));
    } catch {
      setResult({ available: false, enriched: false });
    } finally {
      setBusy(false);
    }
  }

  function copyPromptPack() {
    if (!result?.promptPack) return;
    navigator.clipboard?.writeText(result.promptPack).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      },
      () => {},
    );
  }

  return (
    <PageShell
      title="Idea → PRD"
      sub="From a stored Hot idea to a buildable PRD + Claude Code prompt pack"
      theme={theme}
      onToggleTheme={onToggleTheme}
    >
      <div className="assist-wrap assist-wide">
        {available === false && (
          <div className="assist-empty">
            <div className="assist-empty-title">
              <IconBulb style={{ width: 16, height: 16 }} /> No Hot ideas yet
            </div>
            <p>
              The Hot Ideas pipeline (parity lane) hasn't generated ideas into this database yet.
              Once <code>app_ideas</code> is populated, every idea here gets a one-click PRD.
            </p>
          </div>
        )}

        {available && (
          <div className="assist-prd-grid">
            <div className="assist-idea-col">
              <div className="assist-search">
                <IconSearch style={{ width: 13, height: 13 }} />
                <input
                  placeholder="Search ideas…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="assist-idea-list">
                {ideas.map((i) => (
                  <button
                    key={i.id}
                    className={`assist-idea${selected?.id === i.id ? " active" : ""}`}
                    onClick={() => generate(i)}
                    disabled={busy}
                  >
                    <span className="assist-idea-title">{i.title}</span>
                    {i.category && <span className="assist-idea-cat">{i.category}</span>}
                    {i.summary && <span className="assist-idea-sum">{i.summary}</span>}
                  </button>
                ))}
                {ideas.length === 0 && <div className="assist-empty-sm">No ideas match.</div>}
              </div>
            </div>

            <div className="assist-prd-col">
              {!selected && (
                <div className="assist-empty-sm">
                  Pick an idea — the PRD assembles from its stored Blueprint
                  {seamEnabled ? " and gets a one-call Gemini polish." : "."}
                </div>
              )}
              {busy && <div className="assist-empty-sm">Generating…</div>}
              {result?.markdown && selected && (
                <>
                  <div className="assist-prd-actions">
                    <span className={`assist-enrich${result.enriched ? " on" : ""}`}>
                      {result.enriched ? "Gemini-sharpened" : "Template (no LLM call)"}
                    </span>
                    <button
                      className="btn"
                      onClick={() =>
                        download(`PRD-${selected.slug ?? selected.id}.md`, result.markdown!)
                      }
                    >
                      <IconDownload /> Download .md
                    </button>
                    <button className="btn btn-accent" onClick={copyPromptPack}>
                      {copied ? "Copied ✓" : "Copy Claude Code prompt"}
                    </button>
                  </div>
                  <pre className="assist-prd-preview">{result.markdown}</pre>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
